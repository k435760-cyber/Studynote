/* 전투 밖에서 보는 화면들. 각 builder 는 DOM 을 만들고 refresh() 로 최신 값을 반영한다. */

import { el, icon, registerScreen, showScreen, $ } from './ui.js';
import { CLASSES, CLASS_LIST } from '../game/classes.js';
import { SKILLS, MAX_RANK, rankCost } from '../game/skills.js';
import { AWAKENING, availablePoints, awakeningCost } from '../game/progress.js';
import { RARITIES, SLOTS, statText } from '../game/items.js';
import { expForLevel } from '../game/entities.js';
import { settings, QUALITY, saveSettings, setQuality } from '../core/settings.js';
import { applyVolumes, sfx } from '../core/audio.js';
import { REQUIREMENT } from '../core/bench.js';
import { formatNumber, formatTime, clamp01 } from '../core/util.js';

const ATTRS = [
  { key: 'power', name: '힘', desc: '물리 피해와 치명타 피해' },
  { key: 'agility', name: '민첩', desc: '치명타 확률과 이동 속도' },
  { key: 'intellect', name: '지능', desc: '주문 피해' },
  { key: 'vitality', name: '체력', desc: '최대 생명력' },
];

/* ── 시작 화면 ────────────────────────────────────────────────── */

export function buildTitle(app) {
  const node = el('section', { class: 'title' });
  node.innerHTML = `
    <div class="title__glow"></div>
    <div class="title__inner">
      <p class="title__eyebrow">균열은 아래로 이어진다</p>
      <h1 class="title__logo">AETHERFALL</h1>
      <p class="title__sub">에테르폴 · 심층 강하 기록</p>
      <div class="title__menu">
        <button class="btn btn--primary btn--big" data-go="play">모험 시작</button>
        <button class="btn btn--big" data-go="rank">순위표</button>
        <button class="btn btn--big" data-go="settings">설정</button>
      </div>
      <div class="title__account" id="titleAccount"></div>
    </div>
    <footer class="title__foot">
      <span>권장 사양 · 메모리 ${REQUIREMENT.ram}GB · 저장 공간 ${REQUIREMENT.storage}GB · 싱글코어 ${REQUIREMENT.single}점</span>
      <button class="link" data-go="spec">사양 다시 확인</button>
    </footer>
  `;

  node.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]')?.dataset.go;
    if (!go) return;
    if (go === 'play') app.goSanctum();
    else if (go === 'rank') app.openLeaderboard();
    else if (go === 'settings') app.openSettings();
    else if (go === 'spec') app.runSpecCheck(true);
  });

  node.refresh = () => {
    const box = node.querySelector('#titleAccount');
    const c = app.cloud;
    if (c.status === 'signedIn') {
      box.innerHTML = `
        <div class="account">
          ${c.avatar() ? `<img src="${c.avatar()}" alt="" referrerpolicy="no-referrer">` : `<span class="account__dot"></span>`}
          <span>${escape(c.displayName())} 님으로 접속했습니다</span>
          <button class="link" data-act="signout">로그아웃</button>
        </div>`;
      box.querySelector('[data-act="signout"]').onclick = () => app.signOut();
    } else if (c.available) {
      box.innerHTML = `
        <button class="btn btn--google" data-act="signin">${icon('google')}<span>Google로 계속하기</span></button>
        <p class="muted">로그인하면 기록이 계정에 저장되고 순위표에 오릅니다. 로그인 없이도 바로 즐길 수 있습니다.</p>`;
      box.querySelector('[data-act="signin"]').onclick = () => app.signIn();
    } else {
      box.innerHTML = '<p class="muted">지금은 서버에 연결할 수 없어 기록이 이 기기에만 저장됩니다.</p>';
    }
  };

  registerScreen('title', node);
  return node;
}

/* ── 직업 선택 ────────────────────────────────────────────────── */

export function buildClassSelect(app) {
  const node = el('section', { class: 'pick' });
  node.innerHTML = `
    <header class="pick__head">
      <button class="btn btn--ghost" data-back>뒤로</button>
      <h2>직업을 고르세요</h2>
      <p>직업마다 자원과 싸우는 방식이 다릅니다. 기록은 직업별로 따로 쌓입니다.</p>
    </header>
    <div class="pick__grid" id="pickGrid"></div>
  `;

  node.querySelector('[data-back]').onclick = () => showScreen('title');

  node.refresh = () => {
    const grid = node.querySelector('#pickGrid');
    grid.innerHTML = CLASS_LIST.map((id) => {
      const c = CLASSES[id];
      const hero = app.save.heroes[id];
      const skills = [...c.skills, c.ult].map((sid) => SKILLS[sid]);
      return `
        <button class="card card--class ${app.save.classId === id ? 'is-current' : ''}" data-class="${id}"
                style="--accent:${c.colors.primary};--glow:${c.colors.glow}">
          <div class="card__top">
            <span class="card__role">${c.role}</span>
            <span class="card__lv">Lv ${hero.level}</span>
          </div>
          <h3>${c.name}</h3>
          <p class="card__tag">${c.tagline}</p>
          <p class="card__detail">${c.detail}</p>
          <div class="card__skills">
            ${skills.map((s) => `<span class="mini-skill" title="${escape(s.name)}">${icon(s.icon)}</span>`).join('')}
          </div>
          <div class="card__res"><b>${c.resource.name}</b><span>${c.passive.name}</span></div>
        </button>`;
    }).join('');

    grid.querySelectorAll('[data-class]').forEach((btn) => {
      btn.onclick = () => {
        app.selectClass(btn.dataset.class);
        app.goSanctum();
      };
    });
  };

  registerScreen('class', node);
  return node;
}

/* ── 거점 ────────────────────────────────────────────────────── */

export function buildSanctum(app) {
  const node = el('section', { class: 'sanctum' });
  node.innerHTML = `
    <header class="sanctum__head">
      <button class="btn btn--ghost" data-back>타이틀</button>
      <div class="sanctum__hero" id="sanctumHero"></div>
      <div class="sanctum__aether"><span>에테르</span><b id="sanctumAether">0</b></div>
    </header>

    <nav class="tabs" id="sanctumTabs">
      <button class="tab is-active" data-tab="hero">영웅</button>
      <button class="tab" data-tab="gear">장비</button>
      <button class="tab" data-tab="skill">스킬</button>
      <button class="tab" data-tab="awaken">각성</button>
      <button class="tab" data-tab="rank">순위표</button>
    </nav>

    <div class="sanctum__body" id="sanctumBody"></div>

    <footer class="sanctum__foot">
      <button class="btn btn--ghost" data-act="change">직업 바꾸기</button>
      <button class="btn btn--primary btn--big" data-act="dive">균열로 내려가기</button>
    </footer>
  `;

  let tab = 'hero';
  const body = node.querySelector('#sanctumBody');

  node.querySelector('[data-back]').onclick = () => showScreen('title');
  node.querySelector('[data-act="change"]').onclick = () => { showScreen('class'); app.screens.class.refresh(); };
  node.querySelector('[data-act="dive"]').onclick = () => app.startRun();

  node.querySelector('#sanctumTabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    tab = t.dataset.tab;
    for (const b of node.querySelectorAll('.tab')) b.classList.toggle('is-active', b.dataset.tab === tab);
    sfx('ui');
    node.refresh();
  });

  node.refresh = () => {
    const save = app.save;
    const hero = save.heroes[save.classId];
    const cls = CLASSES[save.classId];
    const pts = availablePoints(hero);

    node.querySelector('#sanctumAether').textContent = formatNumber(save.aether);
    node.querySelector('#sanctumHero').innerHTML = `
      <span class="badge" style="--accent:${cls.colors.primary}">${cls.role}</span>
      <b>${cls.name}</b>
      <span class="muted">Lv ${hero.level} · 최고 ${hero.bestDepth}층</span>
      ${pts.attribute || pts.skill ? `<span class="pill">쓸 수 있는 포인트 ${pts.attribute + pts.skill}</span>` : ''}
    `;

    if (tab === 'hero') body.innerHTML = heroTab(app, hero, cls, pts);
    else if (tab === 'gear') body.innerHTML = gearTab(app, hero);
    else if (tab === 'skill') body.innerHTML = skillTab(app, hero, cls, pts);
    else if (tab === 'awaken') body.innerHTML = awakenTab(app, save);
    else body.innerHTML = '<div class="rank-wrap" id="rankWrap"><p class="muted">불러오는 중…</p></div>';

    if (tab === 'rank') app.fillLeaderboard(body.querySelector('#rankWrap'));
    wireSanctum(app, body, node);
  };

  registerScreen('sanctum', node);
  return node;
}

function heroTab(app, hero, cls, pts) {
  const need = expForLevel(hero.level);
  const stats = app.previewStats();
  return `
    <div class="panel-grid">
      <section class="panel">
        <h3>성장</h3>
        <div class="exp">
          <div class="exp__row"><b>레벨 ${hero.level}</b><span>${formatNumber(hero.exp)} / ${formatNumber(need)}</span></div>
          <div class="bar bar--exp"><i style="width:${clamp01(hero.exp / need) * 100}%"></i></div>
        </div>
        <ul class="attrs">
          ${ATTRS.map((a) => `
            <li>
              <div>
                <b>${a.name}</b>
                <span>${a.desc}</span>
              </div>
              <div class="attrs__val">
                <span>${hero.attributes[a.key]}</span>
                <button class="plus" data-attr="${a.key}" ${pts.attribute ? '' : 'disabled'}>+</button>
              </div>
            </li>`).join('')}
        </ul>
        <p class="muted">남은 특성 포인트 ${pts.attribute}개 · 레벨이 오를 때마다 1개씩 받습니다.</p>
      </section>

      <section class="panel">
        <h3>현재 능력치</h3>
        <ul class="stats">
          <li><span>최대 생명력</span><b>${formatNumber(stats.maxHp)}</b></li>
          <li><span>방어도</span><b>${Math.round(stats.armor)}</b></li>
          <li><span>물리 피해 배수</span><b>${stats.physMul.toFixed(2)}배</b></li>
          <li><span>주문 피해 배수</span><b>${stats.spellMul.toFixed(2)}배</b></li>
          <li><span>치명타 확률</span><b>${(stats.critChance * 100).toFixed(1)}%</b></li>
          <li><span>치명타 피해</span><b>${(stats.critMul * 100).toFixed(0)}%</b></li>
          <li><span>이동 속도</span><b>${Math.round(stats.baseSpeed)}</b></li>
          <li><span>재사용 대기시간 감소</span><b>${(stats.cdr * 100).toFixed(0)}%</b></li>
        </ul>
      </section>

      <section class="panel">
        <h3>${cls.passive.name}</h3>
        <p class="lead">${cls.passive.desc}</p>
        <h3 class="mt">자원 · ${cls.resource.name}</h3>
        <p class="lead">${resourceHint(cls)}</p>
        <h3 class="mt">지금까지</h3>
        <ul class="stats">
          <li><span>최고 기록</span><b>${hero.bestDepth}층</b></li>
          <li><span>탐험 횟수</span><b>${formatNumber(hero.runs)}회</b></li>
          <li><span>처치</span><b>${formatNumber(hero.kills)}</b></li>
        </ul>
      </section>
    </div>`;
}

function resourceHint(cls) {
  const map = {
    guard: '피해를 받을 때 크게 차오릅니다. 싸움이 멎으면 천천히 식습니다.',
    faith: '적을 맞히거나 회복할 때마다 쌓입니다.',
    rage: '때리고 맞을수록 오르고, 전투가 끝나면 식습니다.',
    mana: '시간이 지나면 저절로 회복됩니다.',
    energy: '가장 빠르게 회복되지만 그만큼 소모도 잦습니다.',
  };
  return map[cls.resource.id] || '';
}

function gearTab(app, hero) {
  const slots = Object.values(SLOTS).map((s) => {
    const item = hero.equipped[s.id];
    return `
      <div class="slot ${item ? '' : 'is-empty'}">
        <span class="slot__name">${s.name}</span>
        ${item ? itemCard(item, true) : '<p class="muted">비어 있습니다</p>'}
      </div>`;
  }).join('');

  const stash = hero.stash.length
    ? hero.stash.map((it, i) => itemCard(it, false, i, hero.equipped[it.slot])).join('')
    : '<p class="muted">가방이 비어 있습니다. 균열에서 장비를 주워 오세요.</p>';

  return `
    <div class="gear">
      <section class="panel">
        <h3>착용 중</h3>
        <div class="slots">${slots}</div>
      </section>
      <section class="panel">
        <h3>가방 <span class="muted">${hero.stash.length} / 60</span></h3>
        <div class="stash">${stash}</div>
      </section>
    </div>`;
}

function itemCard(item, equipped, index = -1, compareWith = null) {
  const r = RARITIES[item.rarity];
  const diff = compareWith ? item.score - compareWith.score : null;
  return `
    <article class="item" style="--rare:${r.color}">
      <header>
        <b>${escape(item.name)}</b>
        <span>${r.name} · ${SLOTS[item.slot].name} · ${item.ilvl}단계</span>
      </header>
      <ul>
        ${Object.entries(item.stats).map(([k, v]) => `<li><span>${statName(k)}</span><b>${statText(k, v)}</b></li>`).join('')}
      </ul>
      <footer>
        ${diff !== null ? `<span class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)}</span>` : '<span></span>'}
        ${equipped ? '<span class="muted">착용 중</span>' : `
          <span class="item__btns">
            <button class="btn btn--tiny btn--primary" data-equip="${index}">착용</button>
            <button class="btn btn--tiny" data-break="${index}">분해</button>
          </span>`}
      </footer>
    </article>`;
}

function statName(key) {
  const map = {
    damage: '피해', crit: '치명타 확률', critDmg: '치명타 피해', hp: '최대 생명력',
    armor: '방어도', speed: '이동 속도', cdr: '재사용 대기시간 감소', lifesteal: '흡혈',
    power: '힘', agility: '민첩', intellect: '지능', vitality: '체력',
  };
  return map[key] || key;
}

function skillTab(app, hero, cls, pts) {
  const ids = [...cls.skills, cls.ult];
  return `
    <div class="skills">
      ${ids.map((id) => {
        const s = SKILLS[id];
        const rank = hero.skillRanks[id] || 1;
        const cost = rankCost(rank);
        const can = rank < MAX_RANK && pts.skill >= cost;
        return `
          <article class="panel skill-row ${s.ultimate ? 'is-ult' : ''}">
            <div class="skill-row__icon">${icon(s.icon)}</div>
            <div class="skill-row__main">
              <header>
                <b>${s.name}</b>
                ${s.ultimate ? '<span class="tag tag--ult">궁극기</span>' : `<span class="tag">${s.tag}</span>`}
                <span class="muted">${s.cost} ${cls.resource.name} · 재사용 ${s.cooldown}초</span>
              </header>
              <p>${s.desc(rank)}</p>
              <div class="pips">
                ${Array.from({ length: MAX_RANK }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('')}
                <span>${rank}단계</span>
              </div>
            </div>
            <button class="btn btn--tiny ${can ? 'btn--primary' : ''}" data-rank="${id}" ${can ? '' : 'disabled'}>
              ${rank >= MAX_RANK ? '최대' : `강화 (${cost})`}
            </button>
          </article>`;
      }).join('')}
      <p class="muted">남은 스킬 포인트 ${pts.skill}개 · 두 레벨마다 1개씩 받습니다.</p>
    </div>`;
}

function awakenTab(app, save) {
  return `
    <div class="awaken">
      <p class="lead">각성은 모든 직업이 함께 씁니다. 균열에서 모은 에테르로 영구히 강해집니다.</p>
      <div class="awaken__grid">
        ${Object.values(AWAKENING).map((n) => {
          const rank = save.awakening[n.id] || 0;
          const cost = awakeningCost(n.id, rank);
          const can = cost !== null && save.aether >= cost;
          return `
            <article class="panel node ${rank >= n.max ? 'is-max' : ''}">
              <header><b>${n.name}</b><span>${rank} / ${n.max}</span></header>
              <p>${n.desc}</p>
              <div class="pips">${Array.from({ length: n.max }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('')}</div>
              <button class="btn btn--tiny ${can ? 'btn--primary' : ''}" data-awaken="${n.id}" ${can ? '' : 'disabled'}>
                ${cost === null ? '최대' : `${cost} 에테르`}
              </button>
            </article>`;
        }).join('')}
      </div>
    </div>`;
}

function wireSanctum(app, body, node) {
  body.querySelectorAll('[data-attr]').forEach((b) => {
    b.onclick = () => { app.allocAttribute(b.dataset.attr); node.refresh(); };
  });
  body.querySelectorAll('[data-rank]').forEach((b) => {
    b.onclick = () => { app.rankUp(b.dataset.rank); node.refresh(); };
  });
  body.querySelectorAll('[data-awaken]').forEach((b) => {
    b.onclick = () => { app.buyAwakening(b.dataset.awaken); node.refresh(); };
  });
  body.querySelectorAll('[data-equip]').forEach((b) => {
    b.onclick = () => { app.equipFromStash(Number(b.dataset.equip)); node.refresh(); };
  });
  body.querySelectorAll('[data-break]').forEach((b) => {
    b.onclick = () => { app.breakItem(Number(b.dataset.break)); node.refresh(); };
  });
}

/* ── 결과 ────────────────────────────────────────────────────── */

export function buildResult(app) {
  const node = el('section', { class: 'result' });
  node.innerHTML = '<div class="result__inner" id="resultInner"></div>';

  node.show = (summary, extra) => {
    const cls = CLASSES[summary.classId];
    const headline = extra.abandoned
      ? '스스로 균열에서 물러났습니다'
      : summary.bosses > 0 ? '균열의 주인을 넘어섰습니다' : '균열에 삼켜졌습니다';
    node.querySelector('#resultInner').innerHTML = `
      <p class="result__eyebrow">${headline}</p>
      <h2 class="result__depth">${summary.floor}<span>층</span></h2>
      <p class="result__class">${cls.name} · Lv ${summary.level}</p>
      <ul class="result__stats">
        <li><span>처치</span><b>${formatNumber(summary.kills)}</b></li>
        <li><span>누적 피해</span><b>${formatNumber(summary.damage)}</b></li>
        <li><span>모은 에테르</span><b>${formatNumber(summary.aether)}</b></li>
        <li><span>주운 장비</span><b>${summary.items}</b></li>
        <li><span>걸린 시간</span><b>${formatTime(summary.duration)}</b></li>
        <li><span>처치한 우두머리</span><b>${summary.bosses}</b></li>
      </ul>
      <p class="result__note">${extra.note}</p>
      <div class="result__actions">
        <button class="btn btn--primary btn--big" data-act="again">다시 도전</button>
        <button class="btn btn--big" data-act="sanctum">거점으로</button>
      </div>`;
    node.querySelector('[data-act="again"]').onclick = () => app.startRun();
    node.querySelector('[data-act="sanctum"]').onclick = () => app.goSanctum();
  };

  registerScreen('result', node);
  return node;
}

/* ── 일시 정지 ───────────────────────────────────────────────── */

export function buildPause(app) {
  const node = el('section', { class: 'pause' });
  node.innerHTML = `
    <div class="pause__card">
      <h2>잠시 멈춤</h2>
      <p class="muted" id="pauseInfo"></p>
      <div class="pause__menu">
        <button class="btn btn--primary btn--big" data-act="resume">이어서 하기</button>
        <button class="btn btn--big" data-act="settings">설정</button>
        <button class="btn btn--big btn--danger" data-act="quit">탐험 포기</button>
      </div>
      <div class="keyguide">
        <h4>조작</h4>
        <ul>
          <li><b>W A S D</b> 이동 · 모바일은 화면 왼쪽을 끌어 조이스틱</li>
          <li><b>마우스 왼쪽</b> 기본 공격 · <b>Space</b> 회피</li>
          <li><b>Q E R</b> 스킬 · <b>F</b> 궁극기</li>
          <li><b>Esc</b> 일시 정지</li>
        </ul>
      </div>
    </div>`;

  node.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'resume') app.resume();
    else if (act === 'settings') app.openSettings();
    else if (act === 'quit') app.abandonRun();
  });

  node.refresh = () => {
    const g = app.game;
    if (!g || !g.run) return;
    node.querySelector('#pauseInfo').textContent =
      `${g.run.floor}층 · ${g.run.kills} 처치 · ${formatTime(g.run.time)}`;
  };

  registerScreen('pause', node);
  return node;
}

/* ── 설정 ────────────────────────────────────────────────────── */

export function buildSettings(app) {
  const node = el('section', { class: 'settings' });
  node.innerHTML = `
    <div class="settings__card">
      <header class="settings__head">
        <h2>설정</h2>
        <button class="icon-btn" data-close aria-label="닫기">${icon('close')}</button>
      </header>
      <div class="settings__body" id="settingsBody"></div>
    </div>`;

  node.querySelector('[data-close]').onclick = () => app.closeSettings();

  node.refresh = () => {
    const b = node.querySelector('#settingsBody');
    b.innerHTML = `
      <section class="panel">
        <h3>그래픽</h3>
        <div class="seg" data-seg="quality">
          ${Object.values(QUALITY).map((q) => `
            <button class="${settings.quality === q.id ? 'is-on' : ''}" data-val="${q.id}">${q.label}</button>`).join('')}
        </div>
        <p class="muted">최상은 2560×1440까지 그립니다. 프레임이 흔들리면 한 단계 낮춰 주세요.</p>
        <label class="check"><input type="checkbox" data-toggle="showFps" ${settings.showFps ? 'checked' : ''}><span>초당 프레임 표시</span></label>
        <label class="check"><input type="checkbox" data-toggle="minimap" ${settings.minimap ? 'checked' : ''}><span>작은 지도 표시</span></label>
        <label class="check"><input type="checkbox" data-toggle="damageNumbers" ${settings.damageNumbers ? 'checked' : ''}><span>피해 숫자 표시</span></label>
      </section>

      <section class="panel">
        <h3>소리</h3>
        ${slider('master', '전체', settings.master)}
        ${slider('sfx', '효과음', settings.sfx)}
        ${slider('music', '음악', settings.music)}
      </section>

      <section class="panel">
        <h3>화면 흔들림과 진동</h3>
        ${slider('shake', '화면 흔들림', settings.shake)}
        ${slider('flash', '섬광 효과', settings.flash)}
        <label class="check"><input type="checkbox" data-toggle="vibration" ${settings.vibration ? 'checked' : ''}><span>피격 시 진동 (모바일)</span></label>
      </section>

      <section class="panel">
        <h3>계정과 저장</h3>
        <div class="settings__account" id="settingsAccount"></div>
        <div class="row">
          <button class="btn" data-act="spec">사양 다시 검사</button>
          <button class="btn" data-act="install">설치 안내 보기</button>
          <button class="btn btn--danger" data-act="reset">저장 기록 초기화</button>
        </div>
      </section>`;

    const acc = b.querySelector('#settingsAccount');
    const c = app.cloud;
    if (c.status === 'signedIn') {
      acc.innerHTML = `<p>${escape(c.displayName())} 님으로 접속했습니다. 기록은 자동으로 계정에 저장됩니다.</p>
        <button class="btn" data-act="signout">로그아웃</button>`;
    } else if (c.available) {
      acc.innerHTML = `<p class="muted">로그인하면 다른 기기에서도 이어서 할 수 있습니다.</p>
        <button class="btn btn--google" data-act="signin">${icon('google')}<span>Google로 계속하기</span></button>`;
    } else {
      acc.innerHTML = '<p class="muted">서버에 연결할 수 없습니다. 기록은 이 기기에만 저장됩니다.</p>';
    }

    b.querySelectorAll('[data-seg] button').forEach((btn) => {
      btn.onclick = () => {
        setQuality(btn.dataset.val);
        app.applyQuality();
        node.refresh();
        sfx('ui');
      };
    });
    b.querySelectorAll('[data-toggle]').forEach((input) => {
      input.onchange = () => {
        settings[input.dataset.toggle] = input.checked;
        saveSettings();
      };
    });
    b.querySelectorAll('[data-range]').forEach((input) => {
      input.oninput = () => {
        settings[input.dataset.range] = Number(input.value) / 100;
        applyVolumes();
        const out = input.parentElement.querySelector('output');
        if (out) out.textContent = `${input.value}%`;
      };
      input.onchange = () => saveSettings();
    });
    b.querySelectorAll('[data-act]').forEach((btn) => {
      btn.onclick = () => {
        const act = btn.dataset.act;
        if (act === 'signin') app.signIn();
        else if (act === 'signout') app.signOut();
        else if (act === 'spec') app.runSpecCheck(true);
        else if (act === 'install') app.showInstall();
        else if (act === 'reset') app.resetSave();
      };
    });
  };

  registerScreen('settings', node);
  return node;
}

function slider(key, label, value) {
  const v = Math.round(value * 100);
  return `
    <label class="range">
      <span>${label}</span>
      <input type="range" min="0" max="100" value="${v}" data-range="${key}">
      <output>${v}%</output>
    </label>`;
}

/* ── 사양 점검 ───────────────────────────────────────────────── */

export function buildSpec(app) {
  const node = el('section', { class: 'spec' });
  node.innerHTML = `
    <div class="spec__card">
      <h2>권장 사양 점검</h2>
      <p class="muted">브라우저가 알려주는 값으로 재기 때문에 실제 기기 성능과는 차이가 있을 수 있습니다.</p>
      <div id="specRows" class="spec__rows"><p class="muted">측정하는 중…</p></div>
      <div class="spec__foot" id="specFoot"></div>
    </div>`;

  node.show = (report, onDone) => {
    const rows = node.querySelector('#specRows');
    rows.innerHTML = report.rows.map((r) => `
      <div class="spec__row ${r.pass === false ? 'is-bad' : r.pass ? 'is-ok' : ''}">
        <span class="spec__label">${r.label}</span>
        <span class="spec__want">${r.want}</span>
        <span class="spec__got">${escape(String(r.got))}</span>
        <span class="spec__mark">${r.pass === null ? '–' : r.pass ? icon('check') : icon('warn')}</span>
        ${r.note ? `<p class="spec__note">${r.note}</p>` : ''}
      </div>`).join('');

    const label = QUALITY[report.quality].label;
    node.querySelector('#specFoot').innerHTML = `
      <p>${report.meets
        ? `권장 사양을 모두 넘습니다. 측정 결과에 맞춰 그래픽 품질을 <b>${label}</b>으로 잡아 두었습니다.`
        : `권장 사양에 못 미치는 항목이 있습니다. 그래도 플레이에는 문제가 없도록 그래픽 품질을 <b>${label}</b>으로 잡아 두었습니다. 설정에서 언제든 바꿀 수 있습니다.`}</p>
      <button class="btn btn--primary btn--big" data-act="ok">계속하기</button>`;
    node.querySelector('[data-act="ok"]').onclick = () => onDone();
  };

  registerScreen('spec', node);
  return node;
}

/* ── 순위표 ──────────────────────────────────────────────────── */

export function renderLeaderboard(wrap, rows, cloudStatus) {
  if (cloudStatus !== 'signedIn' && !rows.length) {
    wrap.innerHTML = '<p class="muted">순위표를 불러오지 못했습니다. 잠시 뒤에 다시 시도해 주세요.</p>';
    return;
  }
  if (!rows.length) {
    wrap.innerHTML = '<p class="muted">아직 기록이 없습니다. 첫 번째 이름을 남겨 보세요.</p>';
    return;
  }
  wrap.innerHTML = `
    <table class="rank">
      <thead>
        <tr><th>순위</th><th>이름</th><th>직업</th><th>깊이</th><th>레벨</th><th>처치</th><th>시간</th></tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr class="${r.is_me ? 'is-me' : ''}">
            <td class="rank__no">${r.rank <= 3 ? icon('crown') : ''}${r.rank}</td>
            <td>${escape(r.nickname)}</td>
            <td>${CLASSES[r.class_id]?.name || '—'}</td>
            <td><b>${r.depth}층</b></td>
            <td>${r.level}</td>
            <td>${formatNumber(r.kills)}</td>
            <td>${formatTime(r.duration_seconds)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function escape(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
