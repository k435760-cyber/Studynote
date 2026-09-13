/* 앱 전체를 조립하는 곳. 화면 전환, 저장, 루프가 여기서 시작한다. */

import { angleTo, dist, formatNumber, now } from './core/util.js';
import { settings, loadSettings, saveSettings, quality, setQuality, QUALITY } from './core/settings.js';
import { input, attachInput, updateInput, pressed, held, clearActions } from './core/input.js';
import { initAudio, resumeAudio, applyVolumes, startMusic, stopMusic, updateAudio, sfx, audioReady } from './core/audio.js';
import { runDiagnostics } from './core/bench.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/draw.js';
import { fx } from './render/fx.js';
import { Game } from './game/game.js';
import { CLASS_LIST } from './game/classes.js';
import { SKILLS, MAX_RANK, rankCost } from './game/skills.js';
import {
  loadLocal, saveLocal, clearLocal, newSave, normalize, heroProfile,
  availablePoints, awakeningCost, AWAKENING,
} from './game/progress.js';
import { equipmentTotals, RARITIES } from './game/items.js';
import { Player } from './game/entities.js';
import {
  initUI, initToasts, initModal, showScreen, hideScreens, currentScreen,
  toast, modal, confirmModal, $,
} from './ui/ui.js';
import {
  buildTitle, buildClassSelect, buildSanctum, buildResult, buildPause, buildSettings, buildSpec,
  renderLeaderboard,
} from './ui/screens.js';
import { Hud, drawJoystick } from './ui/hud.js';
import { cloud } from './net/cloud.js';
import { installer } from './pwa/install.js';

const canvas = $('#stage');
const camera = new Camera();
const renderer = new Renderer(canvas);

const app = {
  save: null,
  game: null,
  hud: null,
  screens: {},
  cloud,
  paused: false,
  abandoned: false,
  settingsReturn: 'title',
  lastPush: 0,
};

/* ── 화면 크기 ──────────────────────────────────────────────── */

function resize() {
  const q = quality();
  const dpr = Math.min(window.devicePixelRatio || 1, q.dprCap);
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  let w = Math.round(cssW * dpr);
  let h = Math.round(cssH * dpr);
  const scale = Math.min(1, q.maxWidth / w, q.maxHeight / h);
  w = Math.max(640, Math.round(w * scale));
  h = Math.max(360, Math.round(h * scale));
  renderer.resize(w, h);
  camera.resize(w, h);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  checkOrientation();
}

function checkOrientation() {
  const portrait = window.innerHeight > window.innerWidth;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const notice = $('#rotate');
  const show = portrait && coarse;
  notice.hidden = !show;
  if (show && app.game && app.game.state === 'run' && !app.paused) pause(true);
}

/* ── 조작 입력을 게임이 이해하는 모양으로 ────────────────────── */

function buildControl() {
  const g = app.game;
  const p = g.player;
  const dpr = canvas.width / Math.max(1, window.innerWidth);
  let point = null;
  let aiming = false;

  if (input.usingPointer && !input.touchMode) {
    point = camera.screenToWorld(input.aimScreen.x * dpr, input.aimScreen.y * dpr, canvas.width, canvas.height);
    aiming = true;
  } else if (input.usingPad && Math.hypot(input.aimVector.x, input.aimVector.y) > 0.3) {
    point = { x: p.x + input.aimVector.x * 420, y: p.y + input.aimVector.y * 420 };
    aiming = true;
  } else {
    /* 터치와 패드에서는 가장 가까운 적을 자동으로 겨눈다. */
    const target = settings.autoAim === 'never' ? null : g.nearestEnemy(p.x, p.y, 760);
    if (target) {
      point = { x: target.x, y: target.y };
      aiming = true;
    } else {
      const mv = Math.hypot(input.move.x, input.move.y) > 0.1
        ? Math.atan2(input.move.y, input.move.x)
        : p.facing;
      point = { x: p.x + Math.cos(mv) * 400, y: p.y + Math.sin(mv) * 400 };
    }
  }

  const angle = angleTo(p.x, p.y, point.x, point.y);
  const d = Math.min(dist(p.x, p.y, point.x, point.y), 620);
  const clamped = { x: p.x + Math.cos(angle) * d, y: p.y + Math.sin(angle) * d };

  return {
    move: { x: input.move.x, y: input.move.y },
    aim: { angle, point: clamped },
    aiming,
    actions: {
      attack: held('attack'),
      dodge: pressed('dodge'),
      skill0: pressed('skill1'),
      skill1: pressed('skill2'),
      skill2: pressed('skill3'),
      skill3: pressed('ult'),
    },
  };
}

/* ── 메인 루프 ──────────────────────────────────────────────── */

let last = performance.now();
let fpsAcc = 0, fpsFrames = 0, fps = 0;

function frame(t) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.1, (t - last) / 1000);
  last = t;

  updateInput();
  updateAudio(raw);

  if (pressed('pause')) {
    if (app.paused) resume();
    else if (app.game && app.game.state === 'run') pause();
  }
  if (pressed('inventory') && app.game && app.game.state === 'run' && !app.paused) pause();

  const g = app.game;
  if (g && (g.state === 'run' || g.state === 'dead') && !app.paused) {
    if (g.state === 'run') g.update(raw, buildControl());
    else {
      fx.update(raw);
      camera.follow(g.player, raw);
    }
    renderer.render(g, camera, raw);
    if (input.touchMode) drawJoystick(renderer.ctx, input, window.innerWidth, window.innerHeight);
    app.hud.update(g, raw);
  }

  fpsAcc += raw;
  fpsFrames++;
  if (fpsAcc >= 0.5) {
    fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0; fpsFrames = 0;
    const box = $('#fps');
    box.hidden = !settings.showFps;
    if (settings.showFps) box.textContent = `${fps} FPS · ${canvas.width}×${canvas.height}`;
    if (g && g.state === 'run' && !app.paused) watchFrameRate(fps);
  }
}

/* 프레임이 계속 낮으면 품질을 한 단계 내린다. 한 판에 한 번만 손댄다. */
const QUALITY_STEPS = ['ultra', 'high', 'medium', 'low'];
let slowSeconds = 0;
let qualityDropped = false;

function watchFrameRate(current) {
  if (qualityDropped || current <= 0) return;
  slowSeconds = current < 40 ? slowSeconds + 0.5 : 0;
  if (slowSeconds < 6) return;
  const index = QUALITY_STEPS.indexOf(settings.quality);
  if (index < 0 || index >= QUALITY_STEPS.length - 1) return;
  const next = QUALITY_STEPS[index + 1];
  setQuality(next);
  resize();
  qualityDropped = true;
  slowSeconds = 0;
  toast(`프레임이 낮아 그래픽 품질을 ${QUALITY[next].label}으로 낮췄습니다`);
}

/* ── 게임 상태 전환 ─────────────────────────────────────────── */

function pause(silent = false) {
  if (!app.game || app.game.state !== 'run') return;
  app.paused = true;
  clearActions();
  stopMusic();
  $('#hud').classList.add('is-dim');
  app.screens.pause.refresh();
  showScreen('pause', silent);
}

function resume() {
  if (!app.paused) return;
  app.paused = false;
  clearActions();
  hideScreens();
  $('#hud').classList.remove('is-dim');
  startMusic();
  resumeAudio();
  last = performance.now();
}

function startRun() {
  resumeAudio();
  if (!audioReady()) initAudio();
  applyVolumes();
  app.paused = false;
  hideScreens();
  $('#hud').hidden = false;
  $('#hud').classList.remove('is-dim');
  app.game.startRun(app.save);
  app.hud.setupSkills(app.game.player);
  startMusic();
  last = performance.now();
}

function endRun() {
  const g = app.game;
  const summary = g.summary();
  const save = app.save;
  const hero = save.heroes[summary.classId];

  hero.level = g.player.level;
  hero.exp = g.player.exp;
  hero.bestDepth = Math.max(hero.bestDepth, summary.floor);
  hero.kills += summary.kills;
  hero.runs += 1;
  save.aether += summary.aether;
  save.stats.bestDepth = Math.max(save.stats.bestDepth, summary.floor);
  save.stats.totalKills += summary.kills;
  save.stats.runs += 1;
  save.stats.bosses += summary.bosses;
  save.stats.playtime += summary.duration;
  saveLocal(save);

  $('#hud').hidden = true;
  stopMusic();

  const note = summary.aether > 0
    ? `에테르를 ${formatNumber(summary.aether)} 모아 돌아왔습니다.`
    : '이번에는 빈손으로 돌아왔습니다.';
  app.screens.result.show(summary, { note, abandoned: app.abandoned });
  app.abandoned = false;
  showScreen('result');

  pushCloud();
  if (cloud.status === 'signedIn') {
    cloud.submitRun(summary).then((res) => {
      if (res.ok) toast('순위표에 기록을 올렸습니다');
    });
  }
}

/* ── 저장 ───────────────────────────────────────────────────── */

function persist() {
  saveLocal(app.save);
  schedulePush();
}

let pushTimer = null;
function schedulePush() {
  if (cloud.status !== 'signedIn') return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushCloud, 4000);
}

async function pushCloud() {
  if (cloud.status !== 'signedIn') return;
  const ok = await cloud.pushSave(app.save, Math.floor(Date.now() / 1000));
  if (!ok) console.warn('클라우드 저장에 실패했습니다.');
}

async function syncFromCloud() {
  if (cloud.status !== 'signedIn') return;
  await cloud.touchProfile();
  const remote = await cloud.pullSave();
  if (!remote || !remote.payload) {
    pushCloud();
    return;
  }
  const local = app.save;
  const remoteSave = normalize(remote.payload);
  const remoteTime = remoteSave.updatedAt || 0;
  const localTime = local.updatedAt || 0;

  if (remoteTime > localTime + 5000) {
    const useRemote = await confirmModal(
      '저장된 기록을 찾았습니다',
      `계정에 저장된 기록이 이 기기의 기록보다 최신입니다.<br>
       <b>계정</b> · 최고 ${remoteSave.stats.bestDepth}층 · 에테르 ${formatNumber(remoteSave.aether)}<br>
       <b>이 기기</b> · 최고 ${local.stats.bestDepth}층 · 에테르 ${formatNumber(local.aether)}`,
      '계정 기록 불러오기',
    );
    if (useRemote) {
      app.save = remoteSave;
      saveLocal(app.save);
      refreshAll();
      toast('계정 기록을 불러왔습니다');
      return;
    }
  }
  pushCloud();
}

function refreshAll() {
  app.screens.title.refresh();
  app.screens.sanctum.refresh();
  app.screens.class.refresh();
}

/* ── 화면에서 부르는 동작들 ─────────────────────────────────── */

Object.assign(app, {
  goSanctum() {
    app.screens.sanctum.refresh();
    showScreen('sanctum');
    $('#hud').hidden = true;
  },

  startRun,
  resume,

  selectClass(id) {
    if (!CLASS_LIST.includes(id)) return;
    app.save.classId = id;
    persist();
  },

  previewStats() {
    return new Player(heroProfile(app.save));
  },

  allocAttribute(key) {
    const hero = app.save.heroes[app.save.classId];
    if (availablePoints(hero).attribute <= 0) return;
    hero.attributes[key] = (hero.attributes[key] || 0) + 1;
    sfx('ui');
    persist();
  },

  rankUp(skillId) {
    const hero = app.save.heroes[app.save.classId];
    const rank = hero.skillRanks[skillId] || 1;
    if (rank >= MAX_RANK) return;
    if (availablePoints(hero).skill < rankCost(rank)) return;
    hero.skillRanks[skillId] = rank + 1;
    sfx('levelUp');
    toast(`${SKILLS[skillId].name} ${rank + 1}단계`);
    persist();
  },

  buyAwakening(nodeId) {
    const save = app.save;
    const rank = save.awakening[nodeId] || 0;
    const cost = awakeningCost(nodeId, rank);
    if (cost === null || save.aether < cost) return;
    save.aether -= cost;
    save.awakening[nodeId] = rank + 1;
    sfx('levelUp');
    toast(`${AWAKENING[nodeId].name} ${rank + 1}단계`);
    persist();
  },

  equipFromStash(index) {
    const hero = app.save.heroes[app.save.classId];
    const item = hero.stash[index];
    if (!item) return;
    hero.stash.splice(index, 1);
    const cur = hero.equipped[item.slot];
    hero.equipped[item.slot] = item;
    if (cur) hero.stash.unshift(cur);
    sfx('loot');
    persist();
  },

  breakItem(index) {
    const hero = app.save.heroes[app.save.classId];
    const item = hero.stash[index];
    if (!item) return;
    hero.stash.splice(index, 1);
    const gain = 3 + item.ilvl + Object.keys(RARITIES).indexOf(item.rarity) * 4;
    app.save.aether += gain;
    sfx('ui');
    toast(`분해했습니다 · 에테르 +${gain}`);
    persist();
  },

  openSettings() {
    app.settingsReturn = currentScreen() || 'title';
    app.screens.settings.refresh();
    showScreen('settings');
  },

  closeSettings() {
    if (app.settingsReturn === 'pause' && app.paused) showScreen('pause');
    else if (app.settingsReturn && app.settingsReturn !== 'settings') showScreen(app.settingsReturn);
    else showScreen('title');
  },

  applyQuality() {
    resize();
  },

  async openLeaderboard() {
    app.screens.sanctum.refresh();
    showScreen('sanctum');
    const tabs = document.querySelector('#sanctumTabs [data-tab="rank"]');
    tabs?.click();
  },

  async fillLeaderboard(wrap) {
    if (!wrap) return;
    const rows = await cloud.leaderboard(50);
    renderLeaderboard(wrap, rows, cloud.status);
  },

  async signIn() {
    try {
      await cloud.signInGoogle();
    } catch (e) {
      modal({ title: '로그인을 시작하지 못했습니다', body: e.message || '잠시 뒤에 다시 시도해 주세요.' });
    }
  },

  async signOut() {
    const ok = await confirmModal('로그아웃할까요?', '이 기기에 저장된 기록은 그대로 남습니다.', '로그아웃');
    if (!ok) return;
    await cloud.signOut();
    refreshAll();
    toast('로그아웃했습니다');
  },

  async resetSave() {
    const ok = await confirmModal(
      '정말 초기화할까요?',
      '레벨, 장비, 각성이 모두 사라집니다. 되돌릴 수 없습니다.',
      '초기화',
    );
    if (!ok) return;
    clearLocal();
    app.save = newSave();
    saveLocal(app.save);
    refreshAll();
    showScreen('title');
    toast('기록을 초기화했습니다');
  },

  async abandonRun() {
    const ok = await confirmModal('탐험을 그만둘까요?', '지금까지 모은 에테르와 경험치는 그대로 남습니다.', '그만두기');
    if (!ok) return;
    app.paused = false;
    app.abandoned = true;
    app.game.state = 'idle';
    endRunFromAbandon();
  },

  showInstall() {
    installer.show(true);
  },

  runSpecCheck: runSpecCheck,
});

function endRunFromAbandon() {
  const g = app.game;
  g.state = 'dead';
  endRun();
}

/* ── 게임에서 올라오는 사건 ─────────────────────────────────── */

function onGameEvent(type, data) {
  if (type === 'notify') {
    app.hud.showNotice(data.text);
  } else if (type === 'levelUp') {
    app.hud.showNotice(`레벨 ${data.level} 달성`);
    toast(`레벨이 올랐습니다 · 포인트를 받았습니다`);
  } else if (type === 'floor') {
    app.hud.showNotice(data.boss ? '우두머리가 기다립니다' : `${data.floor}층`);
  } else if (type === 'boss') {
    app.hud.setBoss(app.game.boss, data.title);
  } else if (type === 'bossDown') {
    app.hud.showNotice(`${data.name} 처치`);
  } else if (type === 'death') {
    setTimeout(endRun, 1600);
  } else if (type === 'item') {
    pickupItem(data.item);
  }
}

function pickupItem(item) {
  const save = app.save;
  const hero = save.heroes[save.classId];
  const cur = hero.equipped[item.slot];
  const r = RARITIES[item.rarity];
  if (!cur || item.score > cur.score) {
    if (cur) pushStash(hero, cur);
    hero.equipped[item.slot] = item;
    const p = app.game.player;
    p.equipment.totals = equipmentTotals(hero.equipped);
    p.recompute();
    toast(`${item.name} 착용 · ${r.name}`, 'good');
  } else {
    pushStash(hero, item);
    toast(`${item.name} 획득`, 'info');
  }
  persist();
}

function pushStash(hero, item) {
  hero.stash.unshift(item);
  if (hero.stash.length > 60) {
    hero.stash.sort((a, b) => b.score - a.score);
    hero.stash.length = 60;
  }
}

/* ── 사양 점검 ──────────────────────────────────────────────── */

async function runSpecCheck(manual = false) {
  showScreen('spec');
  const report = await runDiagnostics();
  if (!manual && !settings.specNoticeSeen) {
    settings.quality = report.quality;
  } else if (manual) {
    settings.quality = report.quality;
  }
  settings.specNoticeSeen = true;
  saveSettings();
  resize();
  app.screens.spec.show(report, () => {
    showScreen('title');
  });
}

/* ── 시작 ───────────────────────────────────────────────────── */

async function boot() {
  loadSettings();

  initUI($('#screens'));
  initToasts($('#toasts'));
  initModal($('#modal'));
  attachInput(canvas);

  app.hud = new Hud($('#hud'));
  app.game = new Game({ camera, onEvent: onGameEvent });

  app.screens.title = buildTitle(app);
  app.screens.class = buildClassSelect(app);
  app.screens.sanctum = buildSanctum(app);
  app.screens.result = buildResult(app);
  app.screens.pause = buildPause(app);
  app.screens.settings = buildSettings(app);
  app.screens.spec = buildSpec(app);

  $('#btnPause').addEventListener('click', () => pause());

  app.save = loadLocal() || newSave();

  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 120));
  resize();

  cloud.init();
  cloud.onChange(() => {
    refreshAll();
    if (cloud.status === 'signedIn') syncFromCloud();
  });
  await cloud.restore();

  installer.init($('#overlays'));
  installer.onUpdate = () => {
    toast('새 버전이 준비되었습니다. 새로고침하면 적용됩니다.');
  };

  /* 소리는 사용자가 한 번 눌러야 시작할 수 있다. */
  const wake = () => {
    initAudio();
    applyVolumes();
    resumeAudio();
    removeEventListener('pointerdown', wake);
    removeEventListener('keydown', wake);
  };
  addEventListener('pointerdown', wake);
  addEventListener('keydown', wake);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.game.state === 'run' && !app.paused) pause(true);
  });

  /* 개발 중에 콘솔에서 상태를 들여다볼 수 있게 열어 둔다. */
  window.aetherfall = app;

  $('#boot').hidden = true;
  refreshAll();

  if (!settings.specNoticeSeen) await runSpecCheck(false);
  else showScreen('title');

  requestAnimationFrame(frame);
}

boot();
