/* 전투 중에 보이는 정보. 화면을 가리지 않도록 가장자리에만 붙인다. */

import { clamp01, formatTime, formatNumber } from '../core/util.js';
import { SKILLS, cooldownOf } from '../game/skills.js';
import { expForLevel } from '../game/entities.js';
import { drawMinimap } from '../render/draw.js';
import { setVirtual } from '../core/input.js';
import { icon, el } from './ui.js';
import { settings } from '../core/settings.js';

const KEYCAPS = ['Q', 'E', 'R', 'F'];

const STATUS_LABEL = {
  burn: '화상', bleed: '출혈', poison: '중독', chill: '냉기', freeze: '빙결',
  shock: '감전', stun: '기절', slow: '둔화',
};

const BUFF_LABEL = {
  resolve: '결의', aegis: '불멸', mend: '재생', sanctuary: '성역', covenant: '서약',
  bloodlust: '갈망', ambush: '기습', veil: '은신', shrinePower: '제단의 힘',
};

export class Hud {
  constructor(root) {
    this.root = root;
    this.build();
    this.lastFloor = -1;
    this.noticeTimer = 0;
  }

  build() {
    this.root.innerHTML = `
      <div class="hud__top">
        <div class="hud-floor">
          <b id="hudFloor">1층</b>
          <span id="hudRemain">남은 적 0</span>
        </div>
        <div class="hud-boss" id="hudBoss" hidden>
          <div class="hud-boss__head"><b id="hudBossName"></b><span id="hudBossTitle"></span></div>
          <div class="hud-boss__bar"><i id="hudBossFill"></i></div>
        </div>
        <div class="hud-side">
          <div class="hud-run">
            <span id="hudTime">0:00</span>
            <span class="dot"></span>
            <span id="hudKills">0 처치</span>
          </div>
          <canvas id="minimap" class="minimap" width="240" height="168"></canvas>
          <button class="icon-btn" id="btnPause" type="button" aria-label="메뉴">${icon('menu')}</button>
        </div>
      </div>

      <div class="hud-center">
        <div class="combo" id="hudCombo" hidden><b id="hudComboNum">0</b><span>연속 타격</span></div>
        <div class="notice" id="hudNotice"></div>
      </div>

      <div class="hud__bottom">
        <div class="hud-vitals">
          <div class="vital">
            <div class="bar bar--hp"><i id="hudHpFill"></i><span id="hudHpText">0 / 0</span></div>
            <div class="bar bar--res"><i id="hudResFill"></i><span id="hudResText">0</span></div>
          </div>
          <div class="buffs" id="hudBuffs"></div>
        </div>

        <div class="hud-exp">
          <div class="hud-exp__lv"><b id="hudLevel">1</b><span>레벨</span></div>
          <div class="bar bar--exp"><i id="hudExpFill"></i></div>
        </div>

        <div class="hud-skills" id="hudSkills"></div>
      </div>

      <div class="hud-mobile" id="hudTouch">
        <button class="round-btn round-btn--attack" data-action="attack" type="button">${icon('attack')}</button>
        <button class="round-btn round-btn--dodge" data-action="dodge" type="button">${icon('dodge')}</button>
      </div>
    `;

    this.floor = this.root.querySelector('#hudFloor');
    this.remain = this.root.querySelector('#hudRemain');
    this.time = this.root.querySelector('#hudTime');
    this.kills = this.root.querySelector('#hudKills');
    this.hpFill = this.root.querySelector('#hudHpFill');
    this.hpText = this.root.querySelector('#hudHpText');
    this.resFill = this.root.querySelector('#hudResFill');
    this.resText = this.root.querySelector('#hudResText');
    this.expFill = this.root.querySelector('#hudExpFill');
    this.level = this.root.querySelector('#hudLevel');
    this.skillBar = this.root.querySelector('#hudSkills');
    this.buffs = this.root.querySelector('#hudBuffs');
    this.combo = this.root.querySelector('#hudCombo');
    this.comboNum = this.root.querySelector('#hudComboNum');
    this.notice = this.root.querySelector('#hudNotice');
    this.bossBox = this.root.querySelector('#hudBoss');
    this.bossName = this.root.querySelector('#hudBossName');
    this.bossTitle = this.root.querySelector('#hudBossTitle');
    this.bossFill = this.root.querySelector('#hudBossFill');
    this.minimap = this.root.querySelector('#minimap');
    this.minimapCtx = this.minimap.getContext('2d');

    for (const btn of this.root.querySelectorAll('[data-action]')) {
      bindHold(btn, btn.dataset.action);
    }
  }

  /* 직업이 정해지면 스킬 칸을 다시 만든다. */
  setupSkills(player) {
    const ids = [...player.cls.skills, player.cls.ult];
    this.skillBar.innerHTML = '';
    this.skillNodes = ids.map((id, i) => {
      const skill = SKILLS[id];
      const node = el('button', {
        class: `skill ${skill.ultimate ? 'skill--ult' : ''}`,
        type: 'button',
        'data-action': 'skill' + i,
        title: `${skill.name} · ${skill.desc(player.rank(id))}`,
      }, `
        ${icon(skill.icon)}
        <span class="skill__key">${KEYCAPS[i]}</span>
        <span class="skill__cost">${skill.cost}</span>
        <span class="skill__cd"></span>
        <span class="skill__cdnum"></span>
      `);
      bindHold(node, 'skill' + i);
      this.skillBar.appendChild(node);
      return { id, skill, node, cd: node.querySelector('.skill__cd'), num: node.querySelector('.skill__cdnum') };
    });
  }

  showNotice(text) {
    this.notice.textContent = text;
    this.notice.classList.remove('notice--in');
    void this.notice.offsetWidth;
    this.notice.classList.add('notice--in');
    this.noticeTimer = 2.4;
  }

  setBoss(enemy, title) {
    if (!enemy) { this.bossBox.hidden = true; return; }
    this.bossBox.hidden = false;
    this.bossName.textContent = enemy.name;
    this.bossTitle.textContent = title || '';
  }

  update(game, dt) {
    const p = game.player;
    if (!p) return;

    if (game.run.floor !== this.lastFloor) {
      this.lastFloor = game.run.floor;
      this.floor.textContent = `${game.run.floor}층`;
    }
    this.remain.textContent = game.enemies.length ? `남은 적 ${game.enemies.length}` : '출구가 열렸습니다';
    this.time.textContent = formatTime(game.run.time);
    this.kills.textContent = `${formatNumber(game.run.kills)} 처치`;

    const hpRatio = clamp01(p.hp / p.maxHp);
    this.hpFill.style.width = `${hpRatio * 100}%`;
    this.hpFill.classList.toggle('bar--low', hpRatio < 0.3);
    this.hpText.textContent = p.shield > 0
      ? `${Math.ceil(p.hp)} / ${p.maxHp}  (+${Math.round(p.shield)})`
      : `${Math.ceil(p.hp)} / ${p.maxHp}`;

    const res = p.cls.resource;
    this.resFill.style.width = `${clamp01(p.resource / p.resourceMax) * 100}%`;
    this.resFill.style.background = `linear-gradient(90deg, ${res.color}, ${res.color}cc)`;
    this.resText.textContent = `${res.name} ${Math.floor(p.resource)}`
      + (p.classId === 'shade' && p.marks ? ` · 표식 ${p.marks}` : '');

    const need = expForLevel(p.level);
    this.expFill.style.width = `${clamp01(p.exp / need) * 100}%`;
    this.level.textContent = p.level;

    for (const s of this.skillNodes || []) {
      const left = p.cooldownLeft(s.id);
      const ratio = left > 0 ? left / cooldownOf(s.skill, p.cdr) : 0;
      s.cd.style.height = `${ratio * 100}%`;
      s.num.textContent = left > 0 ? (left >= 1 ? Math.ceil(left) : left.toFixed(1)) : '';
      s.node.classList.toggle('skill--ready', left <= 0 && p.canPay(s.skill.cost));
      s.node.classList.toggle('skill--poor', !p.canPay(s.skill.cost));
    }

    this.renderBuffs(p);

    if (game.comboCount >= 3) {
      this.combo.hidden = false;
      this.comboNum.textContent = game.comboCount;
      this.combo.classList.toggle('combo--hot', game.comboCount >= 15);
    } else {
      this.combo.hidden = true;
    }

    if (this.noticeTimer > 0) {
      this.noticeTimer -= dt;
      if (this.noticeTimer <= 0) this.notice.classList.remove('notice--in');
    }

    if (game.boss) {
      if (this.bossBox.hidden) this.setBoss(game.boss, game.boss.def.title);
      this.bossFill.style.width = `${clamp01(game.boss.hp / game.boss.maxHp) * 100}%`;
    } else if (!this.bossBox.hidden) {
      this.bossBox.hidden = true;
    }

    if (settings.minimap) {
      this.minimap.hidden = false;
      drawMinimap(this.minimapCtx, game, this.minimap.width, this.minimap.height);
    } else {
      this.minimap.hidden = true;
    }
  }

  renderBuffs(p) {
    const items = [];
    for (const [id, b] of Object.entries(p.buffs)) {
      items.push({ id, label: BUFF_LABEL[id] || id, time: b.time, kind: 'buff' });
    }
    for (const [id, s] of Object.entries(p.status)) {
      items.push({ id, label: STATUS_LABEL[id] || id, time: s.time, kind: 'debuff' });
    }
    const key = items.map((i) => i.id).join(',');
    if (key !== this.buffKey) {
      this.buffKey = key;
      this.buffs.innerHTML = items.map((i) => (
        `<span class="chip chip--${i.kind}" data-id="${i.id}">${i.label}<b></b></span>`
      )).join('');
    }
    for (const node of this.buffs.children) {
      const found = items.find((i) => i.id === node.dataset.id);
      if (found) node.querySelector('b').textContent = found.time >= 1 ? Math.ceil(found.time) : found.time.toFixed(1);
    }
  }
}

/* 누르는 동안 계속 눌린 상태로 만든다. 마우스와 손가락 모두 같은 길로 처리한다. */
function bindHold(node, action) {
  const down = (e) => {
    e.preventDefault();
    node.setPointerCapture?.(e.pointerId);
    node.classList.add('is-down');
    setVirtual(action, true);
  };
  const up = () => {
    node.classList.remove('is-down');
    setVirtual(action, false);
  };
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  node.addEventListener('pointerleave', up);
}

/* 캔버스 위에 그리는 가상 조이스틱. DOM 으로 만들면 손가락을 따라 옮기기가 번거롭다. */
export function drawJoystick(ctx, input, w, h) {
  const j = input.joystick;
  if (!j.active) return;
  const dpr = ctx.canvas.width / w;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(190,215,255,0.75)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(j.ox, j.oy, j.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(120,160,220,0.18)';
  ctx.fill();

  const kx = j.ox + j.x * j.radius;
  const ky = j.oy + j.y * j.radius;
  ctx.globalAlpha = 0.85;
  const g = ctx.createRadialGradient(kx, ky, 2, kx, ky, 34);
  g.addColorStop(0, 'rgba(220,235,255,0.95)');
  g.addColorStop(1, 'rgba(120,160,220,0.15)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(kx, ky, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
