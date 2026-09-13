/* 적 정의. think 를 따로 주면 그 함수가 행동을 통째로 맡고,
   없으면 entities.js 의 기본 행동(다가가서 준비 동작 후 공격)을 쓴다. */

import { TAU, rand, angleTo, dist, damp, pick, weightedPick } from '../core/util.js';
import { fx } from '../render/fx.js';
import { sfx } from '../core/audio.js';
import { defaultThink } from './entities.js';

export const ENEMIES = {
  husk: {
    id: 'husk', name: '균열 잔해병', tier: 'normal', silhouette: 'husk',
    r: 29, hp: 62, damage: 11, armor: 6, speed: 172, xp: 12, color: '#8d97bd',
    attack: { type: 'melee', range: 108, arc: 1.35, windup: 0.42, recover: 0.5, cooldown: 1.5, knockback: 170 },
    weight: 100, minFloor: 1,
  },

  stalker: {
    id: 'stalker', name: '균열 사냥개', tier: 'normal', silhouette: 'stalker',
    r: 25, hp: 44, damage: 9, armor: 2, speed: 276, xp: 12, color: '#b86a8a', aggro: 960,
    attack: { type: 'melee', range: 92, arc: 1.1, windup: 0.26, recover: 0.34, cooldown: 1.1, knockback: 120 },
    weight: 85, minFloor: 1,
  },

  archer: {
    id: 'archer', name: '부식된 사수', tier: 'normal', silhouette: 'archer',
    r: 27, hp: 50, damage: 12, armor: 3, speed: 156, xp: 15, color: '#7fb08a',
    attack: {
      type: 'ranged', range: 640, windup: 0.55, recover: 0.5, cooldown: 2.1,
      speed: 640, radius: 13, life: 2.2, spread: 0.06, sprite: 'bolt',
    },
    weight: 70, minFloor: 2,
  },

  spitter: {
    id: 'spitter', name: '독포자', tier: 'normal', silhouette: 'spitter',
    r: 31, hp: 76, damage: 10, armor: 4, speed: 138, xp: 19, color: '#93c46b',
    attack: {
      type: 'custom', range: 520, windup: 0.6, recover: 0.7, cooldown: 3.2, arc: 1,
      run: (e, g, p) => {
        sfx('poison');
        const a = angleTo(e.x, e.y, p.x, p.y);
        const tx = p.x + rand(-60, 60), ty = p.y + rand(-60, 60);
        g.projectile({
          x: e.x, y: e.y, angle: a, speed: dist(e.x, e.y, tx, ty) / 0.9, radius: 18, life: 0.9,
          damage: e.damage * 0.6, type: 'poison', source: e, hostile: true, color: '#93c46b', sprite: 'blob',
          onExpire: (pr) => {
            g.zone({
              x: pr.x, y: pr.y, radius: 150, life: 6, tick: 0.5, color: 'rgba(147,196,107,0.2)', kind: 'poison',
              onHostileTick: () => g.damagePlayer(e.damage * 0.25, { source: e, silent: true, type: 'poison' }),
            });
            fx.dots(pr.x, pr.y, { count: 14, speed: 220, color: '#93c46b', life: 0.8, size: 9, additive: false });
            fx.decal(pr.x, pr.y, { kind: 'scorch', r: 130, color: 'rgba(80,120,50,0.35)', life: 6 });
          },
        });
      },
    },
    weight: 55, minFloor: 4,
  },

  brute: {
    id: 'brute', name: '돌격귀', tier: 'normal', silhouette: 'brute',
    r: 42, hp: 168, damage: 20, armor: 12, speed: 132, xp: 30, color: '#c47a4a',
    attack: {
      type: 'charge', range: 520, windup: 0.75, recover: 0.9, cooldown: 3.6,
      chargeSpeed: 880, chargeTime: 0.7, knockback: 340,
    },
    weight: 46, minFloor: 3,
  },

  wraith: {
    id: 'wraith', name: '떠도는 망령', tier: 'normal', silhouette: 'wraith',
    r: 27, hp: 58, damage: 13, armor: 0, speed: 214, xp: 21, color: '#9b7ee0', flying: true,
    attack: { type: 'melee', range: 104, arc: 1.5, windup: 0.35, recover: 0.45, cooldown: 1.7, knockback: 90 },
    weight: 50, minFloor: 5,
  },

  hexer: {
    id: 'hexer', name: '균열 주술사', tier: 'normal', silhouette: 'hexer',
    r: 29, hp: 84, damage: 12, armor: 5, speed: 148, xp: 28, color: '#cf6fb4',
    aggro: 820,
    think: (e, g, dt, ctx) => {
      /* 다친 동료가 있으면 치유를 먼저 한다. 뒤를 남겨 두면 싸움이 길어진다. */
      e.healCd = Math.max(0, (e.healCd ?? 2) - dt);
      if (e.healCd <= 0 && e.state !== 'windup') {
        const ally = g.enemies.find((o) => o !== e && !o.dead && o.hp < o.maxHp * 0.65 && dist(e.x, e.y, o.x, o.y) < 520);
        if (ally) {
          e.healCd = 6;
          sfx('holy');
          ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.28);
          fx.beam(e.x, e.y, ally.x, ally.y, { color: '#cf6fb4', width: 10, life: 0.4, core: '#ffd9f2' });
          fx.ring(ally.x, ally.y, { r0: 10, r1: ally.r * 2.4, color: '#ffd9f2', width: 6, life: 0.5 });
          fx.text(ally.x, ally.y - ally.r - 20, '치유', { color: '#ffb3e6', size: 26, life: 0.7 });
          return;
        }
      }
      defaultThink(e, g, dt, ctx.player, ctx.distance, ctx.canSee);
    },
    attack: {
      type: 'ranged', range: 560, windup: 0.7, recover: 0.6, cooldown: 2.8,
      speed: 420, radius: 17, life: 2.6, sprite: 'orb', count: 3, fan: 0.22, damageType: 'arcane',
    },
    weight: 40, minFloor: 6,
  },

  sentinel: {
    id: 'sentinel', name: '무너진 파수병', tier: 'elite', silhouette: 'sentinel',
    r: 46, hp: 420, damage: 26, armor: 26, speed: 142, xp: 90, color: '#5f8fd8',
    attack: {
      type: 'custom', range: 260, windup: 0.85, recover: 0.8, cooldown: 3.4, arc: 1.6,
      run: (e, g, p) => {
        sfx('explode');
        const hit = g.playerInRadius(e.x, e.y, 300);
        fx.ring(e.x, e.y, { r0: 30, r1: 310, color: '#9fc4ff', width: 16, life: 0.45 });
        fx.shards(e.x, e.y, { count: 14, color: '#8fa8d8', speed: 480, life: 0.7 });
        fx.decal(e.x, e.y, { kind: 'scorch', r: 180, color: 'rgba(30,40,70,0.4)', life: 8 });
        g.cam.shake(0.5);
        if (hit) g.damagePlayer(e.damage, { source: e, angle: angleTo(e.x, e.y, p.x, p.y), knockback: 320 });
      },
    },
    weight: 0, minFloor: 4,
  },

  warden: {
    id: 'warden', name: '균열 감시자', tier: 'elite', silhouette: 'warden',
    r: 38, hp: 340, damage: 22, armor: 16, speed: 176, xp: 96, color: '#c9a34e',
    think: (e, g, dt, ctx) => {
      e.blinkCd = Math.max(0, (e.blinkCd ?? 4) - dt);
      if (e.blinkCd <= 0 && ctx.distance < 240 && e.state !== 'windup') {
        e.blinkCd = 7;
        const a = angleTo(ctx.player.x, ctx.player.y, e.x, e.y) + rand(-0.8, 0.8);
        const nx = ctx.player.x + Math.cos(a) * 480;
        const ny = ctx.player.y + Math.sin(a) * 480;
        fx.smoke(e.x, e.y, { count: 8, size: 36, life: 0.7 });
        g.placeInside(e, nx, ny);
        fx.ring(e.x, e.y, { r0: 10, r1: 140, color: '#c9a34e', width: 8, life: 0.35 });
        sfx('stealth');
        return;
      }
      defaultThink(e, g, dt, ctx.player, ctx.distance, ctx.canSee);
    },
    attack: {
      type: 'ranged', range: 700, windup: 0.6, recover: 0.55, cooldown: 2.4,
      speed: 700, radius: 15, life: 2.4, sprite: 'bolt', count: 5, fan: 0.16,
    },
    weight: 0, minFloor: 7,
  },
};

/* 층이 깊어질수록 세지는 폭. 체력은 후반에 가파르게, 피해는 완만하게 올린다. */
export function scaleFor(floor) {
  const f = Math.max(0, floor - 1);
  return {
    hp: 1 + f * 0.33 + Math.pow(f, 1.55) * 0.028,
    damage: 1 + f * 0.185,
    armor: 1 + f * 0.2,
    xp: 1 + f * 0.28,
  };
}

export const ELITE_SCALE = { hp: 2.4, damage: 1.35, armor: 1.6, xp: 3.2 };

export function spawnTable(floor) {
  return Object.values(ENEMIES)
    .filter((d) => d.weight > 0 && (d.minFloor || 1) <= floor)
    .map((d) => ({ value: d, weight: d.weight }));
}

export function rollEnemy(floor, rng = Math.random) {
  const table = spawnTable(floor);
  let total = 0;
  for (const t of table) total += t.weight;
  let r = rng() * total;
  for (const t of table) {
    r -= t.weight;
    if (r <= 0) return t.value;
  }
  return ENEMIES.husk;
}

export function rollElite(floor) {
  const pool = [ENEMIES.sentinel, ENEMIES.warden].filter((d) => (d.minFloor || 1) <= floor);
  return pool.length ? pick(pool) : ENEMIES.sentinel;
}

/* ── 보스 ────────────────────────────────────────────────────────── */

function bossShell(e) {
  if (e.phase === undefined) {
    e.phase = 1;
    e.patternCd = 1.6;
    e.busy = 0;
    e.moveTimer = 0;
  }
}

function bossPhaseCheck(e, g) {
  const ratio = e.hp / e.maxHp;
  const want = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
  if (want > e.phase) {
    e.phase = want;
    e.busy = 1.1;
    e.patternCd = 1.2;
    sfx('roar');
    fx.ring(e.x, e.y, { r0: 30, r1: 560, color: e.def.color, width: 22, life: 0.7 });
    fx.flash(e.def.color, 0.24, 0.4);
    fx.dots(e.x, e.y, { count: 40, speed: 520, color: e.def.color, life: 1, size: 11 });
    g.cam.shake(0.8);
    g.notify(`${e.name}의 기세가 달라졌습니다`);
  }
}

/* 보스는 공통으로: 거리를 벌리면 천천히 따라오고, 패턴 쿨이 돌면 하나를 고른다. */
function bossThink(e, g, dt, ctx, patterns) {
  bossShell(e);
  bossPhaseCheck(e, g);
  e.busy = Math.max(0, e.busy - dt);
  e.patternCd -= dt;

  const p = ctx.player;
  if (e.busy > 0) {
    e.vx = damp(e.vx, 0, 0.08, dt);
    e.vy = damp(e.vy, 0, 0.08, dt);
    e.facing = e.facing + (angleTo(e.x, e.y, p.x, p.y) - e.facing) * Math.min(1, dt * 1.6);
    return;
  }

  const flow = g.flowAt(e.x, e.y);
  const a = angleTo(e.x, e.y, p.x, p.y);
  let dx = Math.cos(a), dy = Math.sin(a);
  if (ctx.distance > 420 && flow) { dx = flow.x; dy = flow.y; }
  const want = e.speed * (ctx.distance < 200 ? 0.15 : 1);
  e.vx = damp(e.vx, dx * want, 0.2, dt);
  e.vy = damp(e.vy, dy * want, 0.2, dt);
  e.facing = e.facing + (a - e.facing) * Math.min(1, dt * 2.4);

  if (e.patternCd <= 0) {
    const usable = patterns.filter((pt) => (pt.minPhase || 1) <= e.phase);
    const chosen = weightedPick(usable.map((pt) => ({ value: pt, weight: pt.weight })));
    chosen.run(e, g, p);
    e.busy = chosen.busy;
    e.patternCd = chosen.busy + rand(0.7, 1.5) * (e.phase === 3 ? 0.6 : 1);
  }
}

export const BOSSES = {
  ashlord: {
    id: 'ashlord', name: '잿더미 군주', tier: 'boss', silhouette: 'ashlord',
    r: 74, hp: 2600, damage: 34, armor: 30, speed: 150, xp: 900, color: '#ff8a3c',
    title: '불타는 잿더미 속에서 일어선 것',
    think: (e, g, dt, ctx) => bossThink(e, g, dt, ctx, ASH_PATTERNS),
    attack: { type: 'melee', range: 190, arc: 1.6, windup: 0.6, recover: 0.6, cooldown: 2.4 },
  },

  frostheart: {
    id: 'frostheart', name: '서리심장', tier: 'boss', silhouette: 'frostheart',
    r: 70, hp: 3200, damage: 36, armor: 38, speed: 162, xp: 1200, color: '#7fd8ff',
    title: '얼어붙은 심장을 가진 감시자',
    think: (e, g, dt, ctx) => bossThink(e, g, dt, ctx, FROST_PATTERNS),
    attack: { type: 'melee', range: 200, arc: 1.5, windup: 0.55, recover: 0.6, cooldown: 2.2 },
  },

  voideye: {
    id: 'voideye', name: '공허의 눈', tier: 'boss', silhouette: 'voideye',
    r: 66, hp: 3800, damage: 38, armor: 30, speed: 178, xp: 1600, color: '#b06bff',
    title: '균열 너머에서 이쪽을 보는 것',
    think: (e, g, dt, ctx) => bossThink(e, g, dt, ctx, VOID_PATTERNS),
    attack: { type: 'ranged', range: 700, windup: 0.6, recover: 0.6, cooldown: 2.4, speed: 560, radius: 18, life: 2.6 },
  },
};

const ASH_PATTERNS = [
  {
    weight: 100, busy: 1.5,
    run: (e, g, p) => {
      const tx = p.x, ty = p.y;
      g.telegraph(tx, ty, 300, 0.9, '#ff8a3c');
      sfx('swingHeavy');
      g.after(0.9, () => {
        sfx('explode');
        if (g.playerInRadius(tx, ty, 310)) {
          g.damagePlayer(e.damage * 1.4, { source: e, angle: angleTo(e.x, e.y, p.x, p.y), knockback: 380 });
        }
        fx.explosion(tx, ty, 300, '#ff8a3c');
        g.zone({
          x: tx, y: ty, radius: 220, life: 4, tick: 0.5, color: 'rgba(255,110,50,0.2)', kind: 'fire',
          onHostileTick: () => g.damagePlayer(e.damage * 0.2, { source: e, silent: true, type: 'fire' }),
        });
        g.cam.shake(0.7);
      });
    },
  },
  {
    weight: 80, busy: 1.7, minPhase: 1,
    run: (e, g, p) => {
      /* 부채꼴로 불길을 세 번 뿌린다. 옆으로 빠지면 피할 수 있다. */
      for (let w = 0; w < 3; w++) {
        g.after(w * 0.38, () => {
          const base = angleTo(e.x, e.y, p.x, p.y) + rand(-0.2, 0.2);
          sfx('fire');
          for (let i = -3; i <= 3; i++) {
            g.projectile({
              x: e.x, y: e.y, angle: base + i * 0.17, speed: 520, radius: 20, life: 2.4,
              damage: e.damage * 0.7, type: 'fire', source: e, hostile: true, color: '#ff8a3c', sprite: 'fire',
            });
          }
        });
      }
    },
  },
  {
    weight: 60, busy: 2.2, minPhase: 2,
    run: (e, g, p) => {
      sfx('roar');
      g.notify('잿더미 군주가 부하를 불러냅니다');
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + rand(0, 1);
        g.after(i * 0.15, () => {
          const x = e.x + Math.cos(a) * 220;
          const y = e.y + Math.sin(a) * 220;
          fx.ring(x, y, { r0: 10, r1: 120, color: '#ff8a3c', width: 8, life: 0.4 });
          g.spawnEnemy('husk', x, y);
        });
      }
    },
  },
  {
    weight: 70, busy: 2.4, minPhase: 3,
    run: (e, g, p) => {
      /* 3페이즈 전용. 불바다를 깔면서 돌진한다. */
      const a = angleTo(e.x, e.y, p.x, p.y);
      g.telegraph(e.x + Math.cos(a) * 400, e.y + Math.sin(a) * 400, 180, 0.7, '#ff8a3c');
      g.after(0.7, () => {
        sfx('swingHeavy');
        e.vx = Math.cos(a) * 1100;
        e.vy = Math.sin(a) * 1100;
        let ticks = 0;
        const drop = () => {
          if (ticks++ > 8) return;
          g.zone({
            x: e.x, y: e.y, radius: 130, life: 3.5, tick: 0.5, color: 'rgba(255,110,50,0.22)', kind: 'fire',
            onHostileTick: () => g.damagePlayer(e.damage * 0.18, { source: e, silent: true, type: 'fire' }),
          });
          fx.dots(e.x, e.y, { count: 6, speed: 140, color: '#ff8a3c', life: 0.7, size: 12 });
          if (g.playerInRadius(e.x, e.y, e.r + 40)) {
            g.damagePlayer(e.damage * 1.1, { source: e, angle: a, knockback: 420 });
          }
          g.after(0.12, drop);
        };
        drop();
      });
    },
  },
];

const FROST_PATTERNS = [
  {
    weight: 100, busy: 1.6,
    run: (e, g, p) => {
      g.telegraph(e.x, e.y, 460, 1, '#7fd8ff');
      g.after(1, () => {
        sfx('ice');
        if (g.playerInRadius(e.x, e.y, 470)) {
          g.damagePlayer(e.damage * 1.2, { source: e, angle: angleTo(e.x, e.y, p.x, p.y), knockback: 300 });
          g.chillPlayer(3);
        }
        fx.ring(e.x, e.y, { r0: 40, r1: 480, color: '#7fd8ff', width: 20, life: 0.5 });
        fx.shards(e.x, e.y, { count: 26, color: '#d6f3ff', speed: 700, life: 0.8, size: 14 });
        fx.decal(e.x, e.y, { kind: 'ice', r: 300, color: 'rgba(150,220,255,0.35)', life: 7 });
        g.cam.shake(0.6);
      });
    },
  },
  {
    weight: 85, busy: 2,
    run: (e, g, p) => {
      /* 고드름 세례. 한 발씩 예고 원을 먼저 띄운다. */
      for (let i = 0; i < 6; i++) {
        const tx = p.x + rand(-320, 320);
        const ty = p.y + rand(-320, 320);
        g.after(i * 0.16, () => {
          g.telegraph(tx, ty, 120, 0.6, '#7fd8ff');
          g.after(0.6, () => {
            sfx('ice');
            if (g.playerInRadius(tx, ty, 130)) g.damagePlayer(e.damage * 0.6, { source: e, knockback: 120 });
            fx.ring(tx, ty, { r0: 10, r1: 140, color: '#9fe4ff', width: 10, life: 0.35 });
            fx.shards(tx, ty, { count: 10, color: '#d6f3ff', speed: 420, life: 0.6 });
          });
        });
      }
    },
  },
  {
    weight: 70, busy: 2.6, minPhase: 2,
    run: (e, g, p) => {
      sfx('roar');
      let turns = 0;
      const sweep = () => {
        if (turns++ > 10) return;
        const base = e.animTime * 2.6 + turns * 0.55;
        for (let i = 0; i < 4; i++) {
          g.projectile({
            x: e.x, y: e.y, angle: base + (i / 4) * TAU, speed: 430, radius: 18, life: 3,
            damage: e.damage * 0.55, type: 'frost', source: e, hostile: true, color: '#9fe4ff', sprite: 'shard',
          });
        }
        g.after(0.2, sweep);
      };
      sweep();
    },
  },
  {
    weight: 60, busy: 2.2, minPhase: 3,
    run: (e, g, p) => {
      g.notify('서리심장이 바닥을 얼립니다');
      for (let i = 0; i < 5; i++) {
        const a = rand(0, TAU);
        const d = rand(120, 520);
        const x = e.x + Math.cos(a) * d;
        const y = e.y + Math.sin(a) * d;
        g.after(i * 0.1, () => {
          g.zone({
            x, y, radius: 190, life: 7, tick: 0.5, color: 'rgba(127,216,255,0.18)', kind: 'ice',
            onHostileTick: () => { g.damagePlayer(e.damage * 0.16, { source: e, silent: true, type: 'frost' }); g.chillPlayer(1); },
          });
          fx.decal(x, y, { kind: 'ice', r: 180, color: 'rgba(150,220,255,0.3)', life: 7 });
        });
      }
    },
  },
];

const VOID_PATTERNS = [
  {
    weight: 100, busy: 2.1,
    run: (e, g, p) => {
      /* 시선을 천천히 돌리며 광선을 쏜다. 안쪽으로 파고들면 피하기 쉽다. */
      let a = angleTo(e.x, e.y, p.x, p.y) - 0.9;
      const spin = 0.9 / 12;
      sfx('cast');
      for (let i = 0; i < 12; i++) {
        g.after(i * 0.12, () => {
          const ang = a + spin * i * 2;
          const ex = e.x + Math.cos(ang) * 1400;
          const ey = e.y + Math.sin(ang) * 1400;
          fx.beam(e.x, e.y, ex, ey, { color: '#b06bff', width: 26, life: 0.2, core: '#efe0ff' });
          if (g.playerInLine(e.x, e.y, ang, 1400, 60)) {
            g.damagePlayer(e.damage * 0.5, { source: e, angle: ang, knockback: 60 });
          }
          fx.light(e.x, e.y, 420, 'rgba(176,107,255,0.5)', { life: 0.16 });
        });
      }
    },
  },
  {
    weight: 80, busy: 1.9,
    run: (e, g, p) => {
      sfx('shock');
      for (let ring = 0; ring < 3; ring++) {
        g.after(ring * 0.45, () => {
          const off = rand(0, TAU);
          for (let i = 0; i < 14; i++) {
            g.projectile({
              x: e.x, y: e.y, angle: off + (i / 14) * TAU, speed: 380 + ring * 60, radius: 16, life: 3.4,
              damage: e.damage * 0.45, type: 'arcane', source: e, hostile: true, color: '#b06bff', sprite: 'orb',
            });
          }
          fx.ring(e.x, e.y, { r0: 30, r1: 200, color: '#b06bff', width: 10, life: 0.4 });
        });
      }
    },
  },
  {
    weight: 70, busy: 1.6, minPhase: 2,
    run: (e, g, p) => {
      const a = rand(0, TAU);
      const nx = p.x + Math.cos(a) * 360;
      const ny = p.y + Math.sin(a) * 360;
      fx.smoke(e.x, e.y, { count: 12, size: 60, life: 0.9, color: 'rgba(40,20,70,0.6)' });
      fx.ring(e.x, e.y, { r0: 20, r1: 260, color: '#b06bff', width: 12, life: 0.4 });
      g.placeInside(e, nx, ny);
      sfx('stealth');
      g.after(0.3, () => {
        g.telegraph(e.x, e.y, 360, 0.6, '#b06bff');
        g.after(0.6, () => {
          sfx('explode');
          if (g.playerInRadius(e.x, e.y, 370)) g.damagePlayer(e.damage * 1.3, { source: e, knockback: 340 });
          fx.explosion(e.x, e.y, 340, '#b06bff', { smoke: false });
          g.cam.shake(0.6);
        });
      });
    },
  },
  {
    weight: 65, busy: 2.8, minPhase: 3,
    run: (e, g, p) => {
      g.notify('공허가 바닥을 집어삼킵니다');
      for (let i = 0; i < 7; i++) {
        g.after(i * 0.22, () => {
          const x = p.x + rand(-420, 420);
          const y = p.y + rand(-420, 420);
          g.telegraph(x, y, 200, 0.7, '#b06bff');
          g.after(0.7, () => {
            if (g.playerInRadius(x, y, 210)) g.damagePlayer(e.damage * 0.8, { source: e, knockback: 260 });
            fx.explosion(x, y, 200, '#b06bff', { shards: false, smoke: false });
            g.zone({
              x, y, radius: 170, life: 3, tick: 0.5, color: 'rgba(176,107,255,0.18)', kind: 'void',
              onHostileTick: () => g.damagePlayer(e.damage * 0.14, { source: e, silent: true, type: 'arcane' }),
            });
          });
        });
      }
    },
  },
];

const BOSS_ORDER = ['ashlord', 'frostheart', 'voideye'];

export function bossFor(floor) {
  const index = Math.floor(floor / 5 - 1) % BOSS_ORDER.length;
  return BOSSES[BOSS_ORDER[(index + BOSS_ORDER.length) % BOSS_ORDER.length]];
}

export function isBossFloor(floor) {
  return floor % 5 === 0;
}
