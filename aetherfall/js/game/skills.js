/* 스킬 정의. 실제 판정과 연출은 exec 안에서 게임이 넘겨준 세계 API(g)로 처리한다.
   여기서 직접 엔티티를 만들지 않기 때문에 순환 참조가 없고, 수치도 한눈에 들어온다. */

import { TAU, rand, angleTo, dist, clamp } from '../core/util.js';
import { fx } from '../render/fx.js';
import { sfx } from '../core/audio.js';

/* 랭크에 따른 배율. 1랭크 기준 값에 랭크마다 15%씩 더한다. */
export const sc = (base, rank) => base * (1 + 0.15 * (rank - 1));
const pct = (v) => `${Math.round(v * 100)}%`;
const num = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

export const SKILLS = {
  /* ── 수호기사 ────────────────────────────────────────────────────── */
  bulwark: {
    id: 'bulwark', name: '방벽 강타', icon: 'shield-bash', tag: '피해',
    cost: 15, cooldown: 6, aim: 'direction',
    desc: (r) => `앞으로 파고들며 방패로 밀어칩니다. 피해 ${pct(sc(2.9, r))}, 기절 ${num(sc(0.9, r))}초.`,
    exec(g, p, aim, r) {
      const ang = aim.angle;
      sfx('swingHeavy');
      g.dash(p, ang, 130, 0.16, { invuln: false, trail: p.colors.glow });
      g.after(0.1, () => {
        const hits = g.cone(p.x, p.y, ang, 1.7, 210, {
          damage: p.dmg(sc(2.9, r), 'physical'), type: 'physical',
          knockback: 340, angle: ang, source: p,
        });
        for (const e of hits) g.status(e, 'stun', sc(0.9, r));
        fx.arc(p.x, p.y, { angle: ang, spread: 1.7, radius: 190, color: p.colors.glow, width: 40, life: 0.24, swing: 0.5 });
        fx.ring(p.x + Math.cos(ang) * 90, p.y + Math.sin(ang) * 90, { r0: 20, r1: 150, color: p.colors.glow, width: 10, life: 0.3 });
        fx.shards(p.x + Math.cos(ang) * 120, p.y + Math.sin(ang) * 120, { count: 9, color: '#cfe0ff', angle: ang, spread: 1.6 });
        g.cam.shake(hits.length ? 0.34 : 0.16);
        if (hits.length) { fx.hitstop(0.055); sfx('hit'); }
        p.gainResource(8);
      });
      return true;
    },
  },

  warcry: {
    id: 'warcry', name: '결의의 함성', icon: 'warcry', tag: '보호',
    cost: 25, cooldown: 12, aim: 'self',
    desc: (r) => `주변 적을 끌어당기고 ${num(sc(5, r))}초 동안 받는 피해가 ${pct(0.3)} 줄어듭니다.`,
    exec(g, p, aim, r) {
      sfx('roar');
      const radius = 360;
      const list = g.enemiesInRadius(p.x, p.y, radius);
      for (const e of list) {
        g.status(e, 'taunt', 4, { by: p });
        g.knockback(e, angleTo(p.x, p.y, e.x, e.y), -140);
      }
      p.addBuff('resolve', sc(5, r), { damageTaken: 0.7 });
      p.gainResource(30);
      for (let i = 0; i < 3; i++) {
        fx.ring(p.x, p.y, { r0: 40, r1: radius * (0.7 + i * 0.15), color: p.colors.trim, width: 12 - i * 3, life: 0.5 + i * 0.1 });
      }
      fx.decal(p.x, p.y, { kind: 'rune', r: 150, color: 'rgba(226,201,138,0.5)', life: 5 });
      fx.dots(p.x, p.y, { count: 26, speed: 420, color: p.colors.trim, life: 0.7, size: 8 });
      fx.light(p.x, p.y, 620, 'rgba(226,201,138,0.55)', { life: 0.5, intensity: 1 });
      g.cam.shake(0.4);
      return true;
    },
  },

  sunder: {
    id: 'sunder', name: '대지 가르기', icon: 'sunder', tag: '피해',
    cost: 30, cooldown: 9, aim: 'direction',
    desc: (r) => `땅을 내리찍어 ${pct(sc(3.4, r))} 피해를 주고, 갈라진 땅이 ${num(4)}초 동안 적을 ${pct(0.45)} 느리게 합니다.`,
    exec(g, p, aim, r) {
      const ang = aim.angle;
      const cx = p.x + Math.cos(ang) * 120;
      const cy = p.y + Math.sin(ang) * 120;
      p.lockMove(0.22);
      g.after(0.16, () => {
        sfx('explode');
        g.circle(cx, cy, 280, {
          damage: p.dmg(sc(3.4, r), 'physical'), type: 'physical',
          knockback: 220, source: p, falloff: 0.45,
        });
        g.zone({
          x: cx, y: cy, radius: 280, life: 4, tick: 0.5, color: 'rgba(226,201,138,0.16)', kind: 'crack',
          onTick: (e) => g.status(e, 'slow', 0.8, { mul: 0.55 }),
        });
        fx.ring(cx, cy, { r0: 20, r1: 300, color: '#e2c98a', width: 16, life: 0.45 });
        fx.ring(cx, cy, { r0: 10, r1: 180, color: '#ffffff', width: 6, life: 0.26 });
        fx.shards(cx, cy, { count: 16, color: '#6b5a42', speed: 520, life: 0.8, size: 13 });
        fx.smoke(cx, cy, { count: 10, size: 44, life: 1.2 });
        fx.decal(cx, cy, { kind: 'scorch', r: 200, color: 'rgba(40,30,16,0.4)', life: 12 });
        g.cam.shake(0.7);
        fx.hitstop(0.07);
      });
      return true;
    },
  },

  aegis: {
    id: 'aegis', name: '불멸의 성벽', icon: 'aegis', tag: '보호', ultimate: true,
    cost: 60, cooldown: 40, aim: 'self',
    desc: (r) => `${num(7)}초 동안 최대 생명력의 ${pct(sc(0.45, r))}만큼 보호막을 두르고, 받은 피해의 ${pct(0.4)}를 되돌려 줍니다.`,
    exec(g, p, aim, r) {
      sfx('shieldUp');
      p.addShield(p.maxHp * sc(0.45, r));
      p.addBuff('aegis', 7, { reflect: 0.4, stunImmune: true });
      for (let i = 0; i < 4; i++) {
        fx.ring(p.x, p.y, { r0: 20, r1: 200 + i * 40, color: i % 2 ? '#ffffff' : p.colors.glow, width: 10, life: 0.4 + i * 0.08 });
      }
      fx.dots(p.x, p.y, { count: 30, speed: 260, color: p.colors.glow, life: 1, size: 9, rise: 60 });
      fx.light(p.x, p.y, 720, 'rgba(159,196,255,0.7)', { life: 0.6, intensity: 1.2 });
      fx.flash('#9fc4ff', 0.28, 0.3);
      g.cam.shake(0.5);
      return true;
    },
  },

  /* ── 신탁사제 ────────────────────────────────────────────────────── */
  mend: {
    id: 'mend', name: '치유의 파문', icon: 'mend', tag: '회복',
    cost: 22, cooldown: 7, aim: 'self',
    desc: (r) => `즉시 최대 생명력의 ${pct(sc(0.22, r))}를 회복하고, ${num(5)}초에 걸쳐 ${pct(sc(0.16, r))}를 더 회복합니다.`,
    exec(g, p, aim, r) {
      sfx('heal');
      g.healPlayer(p.maxHp * sc(0.22, r));
      p.addBuff('mend', 5, { regen: (p.maxHp * sc(0.16, r)) / 5 });
      fx.ring(p.x, p.y, { r0: 20, r1: 190, color: '#ffe9a8', width: 12, life: 0.5 });
      fx.dots(p.x, p.y, { count: 24, speed: 120, color: '#fff4cf', life: 1.1, size: 8, rise: 130 });
      fx.light(p.x, p.y, 460, 'rgba(255,233,168,0.6)', { life: 0.5, intensity: 1 });
      return true;
    },
  },

  judgement: {
    id: 'judgement', name: '심판의 빛', icon: 'judgement', tag: '피해',
    cost: 30, cooldown: 8, aim: 'direction',
    desc: (r) => `앞으로 빛줄기를 세 번 내리쳐 매번 ${pct(sc(1.55, r))} 피해를 주고 신성 화상을 남깁니다.`,
    exec(g, p, aim, r) {
      const ang = aim.angle;
      p.lockMove(0.3);
      for (let i = 0; i < 3; i++) {
        g.after(i * 0.13, () => {
          sfx('holy');
          const len = 860;
          const hits = g.line(p.x, p.y, ang, len, 74, {
            damage: p.dmg(sc(1.55, r), 'holy'), type: 'holy', source: p, knockback: 60, angle: ang,
          });
          for (const e of hits) g.status(e, 'burn', 3, { dps: p.dmg(sc(0.3, r), 'holy') / 3, holy: true });
          const ex = p.x + Math.cos(ang) * len;
          const ey = p.y + Math.sin(ang) * len;
          fx.beam(p.x, p.y, ex, ey, { color: '#ffe9a8', width: 52 - i * 6, life: 0.22, core: '#fffdf2' });
          fx.sparks(p.x + Math.cos(ang) * 140, p.y + Math.sin(ang) * 140, { count: 10, angle: ang, spread: 0.5, speed: 620, color: '#fff4cf' });
          fx.light(p.x, p.y, 520, 'rgba(255,233,168,0.5)', { life: 0.2 });
          g.cam.shake(0.2);
        });
      }
      return true;
    },
  },

  sanctuary: {
    id: 'sanctuary', name: '성역', icon: 'sanctuary', tag: '보호',
    cost: 35, cooldown: 16, aim: 'point',
    desc: (r) => `${num(8)}초 동안 성역을 세웁니다. 안에 있으면 초당 ${pct(sc(0.035, r))} 회복하고 받는 피해가 ${pct(0.25)} 줄어듭니다.`,
    exec(g, p, aim, r) {
      sfx('holy');
      const { x, y } = aim.point;
      g.zone({
        x, y, radius: 300, life: 8, tick: 0.5, color: 'rgba(255,233,168,0.13)', kind: 'sanctuary',
        friendly: true,
        onTick: (e) => g.status(e, 'slow', 0.7, { mul: 0.78 }),
        onPlayerTick: () => {
          g.healPlayer(p.maxHp * sc(0.035, r) * 0.5);
          p.addBuff('sanctuary', 0.7, { damageTaken: 0.75 });
        },
      });
      fx.decal(x, y, { kind: 'rune', r: 280, color: 'rgba(255,233,168,0.45)', life: 8 });
      fx.ring(x, y, { r0: 40, r1: 300, color: '#ffe9a8', width: 14, life: 0.6 });
      fx.dots(x, y, { count: 30, speed: 90, color: '#fff4cf', life: 1.4, size: 7, rise: 160 });
      return true;
    },
  },

  covenant: {
    id: 'covenant', name: '부활의 서약', icon: 'covenant', tag: '회복', ultimate: true,
    cost: 70, cooldown: 50, aim: 'self',
    desc: (r) => `${num(8)}초 동안 치명적인 피해를 한 번 막고, 초당 ${pct(sc(0.06, r))} 회복하며 주변 적을 빛으로 태웁니다.`,
    exec(g, p, aim, r) {
      sfx('levelUp');
      p.addBuff('covenant', 8, { regen: p.maxHp * sc(0.06, r), cheatDeath: true });
      let ticks = 0;
      const pulse = () => {
        if (ticks++ > 7 || p.dead) return;
        g.circle(p.x, p.y, 430, {
          damage: p.dmg(sc(0.9, r), 'holy'), type: 'holy', source: p, falloff: 0.5,
        });
        fx.ring(p.x, p.y, { r0: 30, r1: 440, color: '#ffe9a8', width: 10, life: 0.5 });
        fx.light(p.x, p.y, 700, 'rgba(255,240,200,0.5)', { life: 0.4, intensity: 1 });
        g.after(1, pulse);
      };
      pulse();
      fx.flash('#fff4cf', 0.42, 0.5);
      fx.dots(p.x, p.y, { count: 44, speed: 180, color: '#fff4cf', life: 1.6, size: 10, rise: 220 });
      g.cam.shake(0.5);
      return true;
    },
  },

  /* ── 광전사 ──────────────────────────────────────────────────────── */
  rend: {
    id: 'rend', name: '질주 참격', icon: 'rend', tag: '이동',
    cost: 20, cooldown: 5, aim: 'direction',
    desc: (r) => `앞으로 돌진하며 지나친 적에게 ${pct(sc(2.2, r))} 피해를 주고 출혈을 남깁니다.`,
    exec(g, p, aim, r) {
      const ang = aim.angle;
      sfx('dash');
      const struck = new Set();
      g.dash(p, ang, 460, 0.2, {
        invuln: true, trail: p.colors.glow,
        onTouch: (e) => {
          if (struck.has(e.id)) return;
          struck.add(e.id);
          g.damage(e, p.dmg(sc(2.2, r), 'physical'), { type: 'physical', source: p, angle: ang, knockback: 160 });
          g.status(e, 'bleed', 5, { dps: p.dmg(sc(0.34, r), 'physical') });
          fx.arc(e.x, e.y, { angle: ang, spread: 2.2, radius: 90, color: '#ff9a6a', width: 26, life: 0.2 });
          fx.bloodBurst(e.x, e.y, ang);
        },
      });
      fx.arc(p.x, p.y, { angle: ang, spread: 1.9, radius: 150, color: '#ff9a6a', width: 30, life: 0.24, swing: 0.7 });
      return true;
    },
  },

  whirl: {
    id: 'whirl', name: '회전 베기', icon: 'whirl', tag: '피해',
    cost: 30, cooldown: 8, aim: 'self',
    desc: (r) => `${num(1.6)}초 동안 돌면서 주변 적에게 ${pct(sc(0.62, r))} 피해를 반복해서 줍니다.`,
    exec(g, p, aim, r) {
      sfx('swingHeavy');
      p.startChannel({
        id: 'whirl', duration: 1.6, tick: 0.17, moveMul: 0.72,
        onTick: () => {
          const hits = g.circle(p.x, p.y, 200, {
            damage: p.dmg(sc(0.62, r), 'physical'), type: 'physical', source: p, knockback: 60,
          });
          fx.arc(p.x, p.y, {
            angle: rand(0, TAU), spread: 2.6, radius: 185, color: '#ff9a6a', width: 24, life: 0.16, swing: 1.4,
          });
          if (hits.length) { sfx('hit'); g.cam.shake(0.12); }
        },
        onEnd: () => {
          fx.ring(p.x, p.y, { r0: 60, r1: 250, color: '#ff9a6a', width: 12, life: 0.3 });
        },
      });
      return true;
    },
  },

  bloodlust: {
    id: 'bloodlust', name: '피의 갈망', icon: 'bloodlust', tag: '보호',
    cost: 25, cooldown: 14, aim: 'self',
    desc: (r) => `${num(6)}초 동안 공격 속도가 ${pct(0.35)}, 흡혈이 ${pct(sc(0.18, r))} 오릅니다.`,
    exec(g, p, aim, r) {
      sfx('roar');
      p.addBuff('bloodlust', 6, { haste: 1.35, lifesteal: sc(0.18, r), speed: 1.12 });
      fx.ring(p.x, p.y, { r0: 20, r1: 220, color: '#ff6a4a', width: 14, life: 0.45 });
      fx.dots(p.x, p.y, { count: 24, speed: 200, color: '#ff8a5c', life: 0.9, size: 9, rise: 40 });
      fx.flash('#ff6a4a', 0.18, 0.25);
      return true;
    },
  },

  execute: {
    id: 'execute', name: '처형', icon: 'execute', tag: '피해', ultimate: true,
    cost: 60, cooldown: 35, aim: 'direction',
    desc: (r) => `앞을 크게 베어 ${pct(sc(5.4, r))} 피해를 줍니다. 생명력이 35% 아래인 적에게는 피해가 두 배입니다.`,
    exec(g, p, aim, r) {
      const ang = aim.angle;
      p.lockMove(0.28);
      p.setInvuln(0.35);
      g.after(0.18, () => {
        sfx('swingHeavy');
        sfx('hitCrit');
        const hits = g.cone(p.x, p.y, ang, 2.1, 330, {
          damage: p.dmg(sc(5.4, r), 'physical'), type: 'physical', source: p,
          knockback: 380, angle: ang,
          modify: (e, dmg) => (e.hp / e.maxHp < 0.35 ? dmg * 2 : dmg),
        });
        fx.arc(p.x, p.y, { angle: ang, spread: 2.1, radius: 300, color: '#ff5a3c', width: 64, life: 0.32, swing: 0.9 });
        fx.arc(p.x, p.y, { angle: ang, spread: 1.6, radius: 240, color: '#ffffff', width: 22, life: 0.24, swing: 0.7 });
        fx.sparks(p.x + Math.cos(ang) * 200, p.y + Math.sin(ang) * 200, { count: 26, angle: ang, spread: 2, speed: 900, color: '#ffb08a', life: 0.5 });
        fx.flash('#ff4a2a', 0.34, 0.32);
        g.cam.shake(0.85);
        fx.hitstop(0.13);
        if (hits.length) g.slowMotion(0.4, 0.35);
      });
      return true;
    },
  },

  /* ── 비전술사 ────────────────────────────────────────────────────── */
  fireball: {
    id: 'fireball', name: '화염구', icon: 'fireball', tag: '피해',
    cost: 18, cooldown: 3, aim: 'direction',
    desc: (r) => `폭발하는 불덩이를 던져 ${pct(sc(2.5, r))} 피해를 주고 화상을 남깁니다.`,
    exec(g, p, aim, r) {
      sfx('cast');
      g.projectile({
        x: p.x, y: p.y, angle: aim.angle, speed: 660, radius: 20, life: 1.6,
        damage: p.dmg(sc(2.5, r), 'fire'), type: 'fire', source: p, color: '#ff9a4d', sprite: 'fire',
        aoe: 180, aoeFalloff: 0.5,
        onHit: (e) => e && g.status(e, 'burn', 4, { dps: p.dmg(sc(0.42, r), 'fire') }),
        onExpire: (pr) => {
          sfx('explode');
          fx.explosion(pr.x, pr.y, 180, '#ff9a4d');
          g.cam.shake(0.4);
        },
      });
      return true;
    },
  },

  frostnova: {
    id: 'frostnova', name: '서리 폭발', icon: 'frost', tag: '보호',
    cost: 22, cooldown: 7, aim: 'self',
    desc: (r) => `주변에 서리를 터뜨려 ${pct(sc(1.7, r))} 피해를 주고 적을 둔화시킵니다. 이미 냉기에 걸린 적은 ${num(sc(1.2, r))}초 동안 얼어붙습니다.`,
    exec(g, p, aim, r) {
      sfx('ice');
      const hits = g.circle(p.x, p.y, 320, {
        damage: p.dmg(sc(1.7, r), 'frost'), type: 'frost', source: p, knockback: 140, falloff: 0.35,
      });
      for (const e of hits) {
        if (e.status.chill) g.status(e, 'freeze', sc(1.2, r));
        g.status(e, 'chill', 4, { mul: 0.5 });
      }
      fx.ring(p.x, p.y, { r0: 20, r1: 330, color: '#9fe4ff', width: 16, life: 0.4 });
      fx.ring(p.x, p.y, { r0: 10, r1: 220, color: '#ffffff', width: 6, life: 0.26 });
      fx.shards(p.x, p.y, { count: 20, color: '#cdeeff', speed: 620, life: 0.7, size: 12 });
      fx.decal(p.x, p.y, { kind: 'ice', r: 220, color: 'rgba(160,225,255,0.35)', life: 6 });
      fx.light(p.x, p.y, 560, 'rgba(159,228,255,0.5)', { life: 0.35 });
      g.cam.shake(0.35);
      return true;
    },
  },

  chain: {
    id: 'chain', name: '연쇄 번개', icon: 'chain', tag: '피해',
    cost: 26, cooldown: 6, aim: 'direction',
    desc: (r) => `번개가 적 ${3 + r}명까지 튀며 ${pct(sc(2.1, r))} 피해를 주고 감전시킵니다.`,
    exec(g, p, aim, r) {
      sfx('shock');
      let from = { x: p.x, y: p.y };
      const hitIds = new Set();
      let damage = p.dmg(sc(2.1, r), 'shock');
      const maxJumps = 3 + r;
      for (let i = 0; i < maxJumps; i++) {
        const target = g.nearestEnemy(from.x, from.y, i === 0 ? 620 : 320, (e) => !hitIds.has(e.id));
        if (!target) break;
        hitIds.add(target.id);
        const fx0 = from, tgt = target, dmg = damage;
        g.after(i * 0.06, () => {
          g.damage(tgt, dmg, { type: 'shock', source: p, angle: angleTo(fx0.x, fx0.y, tgt.x, tgt.y) });
          g.status(tgt, 'shock', 4, { vulnerable: 0.16 });
          /* 번개는 곧게 가지 않는다. 중간을 몇 번 꺾어 준다. */
          let px = fx0.x, py = fx0.y;
          const segs = 4;
          for (let s = 1; s <= segs; s++) {
            const t = s / segs;
            const nx = fx0.x + (tgt.x - fx0.x) * t + (s < segs ? rand(-34, 34) : 0);
            const ny = fx0.y + (tgt.y - fx0.y) * t + (s < segs ? rand(-34, 34) : 0);
            fx.beam(px, py, nx, ny, { color: '#b6e0ff', width: 11, life: 0.18, core: '#ffffff' });
            px = nx; py = ny;
          }
          fx.sparks(tgt.x, tgt.y, { count: 10, speed: 460, color: '#d9f0ff', life: 0.3 });
          fx.light(tgt.x, tgt.y, 260, 'rgba(160,210,255,0.6)', { life: 0.18 });
        });
        from = { x: target.x, y: target.y };
        damage *= 0.85;
      }
      g.cam.shake(0.25);
      return true;
    },
  },

  meteor: {
    id: 'meteor', name: '운석 낙하', icon: 'meteor', tag: '피해', ultimate: true,
    cost: 60, cooldown: 40, aim: 'point',
    desc: (r) => `지정한 곳에 운석을 떨어뜨려 ${pct(sc(7, r))} 피해를 주고 불바다를 만듭니다.`,
    exec(g, p, aim, r) {
      const { x, y } = aim.point;
      sfx('cast');
      g.telegraph(x, y, 380, 0.85, '#ff7a3c');
      g.after(0.85, () => {
        sfx('explode');
        sfx('dieBig');
        g.circle(x, y, 380, {
          damage: p.dmg(sc(7, r), 'fire'), type: 'fire', source: p, knockback: 420, falloff: 0.4,
        });
        g.zone({
          x, y, radius: 300, life: 5, tick: 0.5, color: 'rgba(255,120,60,0.18)', kind: 'fire',
          onTick: (e) => g.damage(e, p.dmg(sc(0.5, r), 'fire'), { type: 'fire', source: p, silent: true }),
        });
        fx.explosion(x, y, 400, '#ff7a3c');
        fx.ring(x, y, { r0: 60, r1: 640, color: '#ffd0a0', width: 20, life: 0.6 });
        fx.flash('#ff8a4a', 0.4, 0.4);
        g.cam.shake(1);
        fx.hitstop(0.14);
        g.slowMotion(0.45, 0.3);
      });
      return true;
    },
  },

  /* ── 그림자 자객 ─────────────────────────────────────────────────── */
  shadowstep: {
    id: 'shadowstep', name: '그림자 도약', icon: 'shadowstep', tag: '이동',
    cost: 25, cooldown: 5, aim: 'direction',
    desc: (r) => `그림자를 타고 앞으로 빠져나갑니다. 지나치는 적에게 ${pct(sc(2.2, r))} 피해를 주고, 도착한 뒤 ${num(3)}초 안에 하는 첫 공격은 반드시 치명타가 됩니다.`,
    exec(g, p, aim, r) {
      sfx('stealth');
      const ang = aim.angle;
      const target = g.nearestEnemy(p.x, p.y, 520);
      let dx, dy;
      if (target && Math.abs(Math.cos(angleTo(p.x, p.y, target.x, target.y) - ang)) > 0.4) {
        /* 조준 방향에 적이 있으면 그 뒤로 넘어간다. */
        const a = angleTo(p.x, p.y, target.x, target.y);
        dx = target.x + Math.cos(a) * (target.r + 60);
        dy = target.y + Math.sin(a) * (target.r + 60);
      } else {
        dx = p.x + Math.cos(ang) * 400;
        dy = p.y + Math.sin(ang) * 400;
      }
      const from = { x: p.x, y: p.y };
      g.blink(p, dx, dy);
      p.addBuff('ambush', 3, { guaranteedCrit: true, critBonus: sc(0.6, r) });
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        fx.dots(from.x + (p.x - from.x) * t, from.y + (p.y - from.y) * t,
          { count: 4, speed: 90, color: '#7a5cff', life: 0.45, size: 12 });
      }
      fx.ring(from.x, from.y, { r0: 10, r1: 120, color: '#7a5cff', width: 8, life: 0.3 });
      fx.ring(p.x, p.y, { r0: 10, r1: 140, color: '#9bffe4', width: 8, life: 0.3 });
      if (target) {
        g.damage(target, p.dmg(sc(2.2, r), 'physical'), { type: 'physical', source: p, angle: ang, crit: true });
        fx.arc(target.x, target.y, { angle: ang, spread: 2, radius: 100, color: '#9bffe4', width: 24, life: 0.2 });
      }
      return true;
    },
  },

  venom: {
    id: 'venom', name: '맹독 칼날', icon: 'venom', tag: '피해',
    cost: 20, cooldown: 7, aim: 'direction',
    desc: (r) => `앞을 찢어 ${pct(sc(1.5, r))} 피해를 주고 독을 겹칩니다. 독은 다섯 겹까지 쌓입니다.`,
    exec(g, p, aim, r) {
      sfx('swing');
      const ang = aim.angle;
      const hits = g.cone(p.x, p.y, ang, 1.5, 230, {
        damage: p.dmg(sc(1.5, r), 'physical'), type: 'physical', source: p, knockback: 90, angle: ang,
      });
      for (const e of hits) {
        const stack = Math.min(5, (e.status.poison?.stacks || 0) + 2);
        g.status(e, 'poison', 6, { dps: p.dmg(sc(0.26, r), 'poison'), stacks: stack });
      }
      fx.arc(p.x, p.y, { angle: ang - 0.2, spread: 1.5, radius: 200, color: '#8dff9f', width: 22, life: 0.22, swing: 0.6 });
      fx.arc(p.x, p.y, { angle: ang + 0.2, spread: 1.5, radius: 210, color: '#4fd1b0', width: 18, life: 0.24, swing: -0.6 });
      fx.dots(p.x + Math.cos(ang) * 140, p.y + Math.sin(ang) * 140,
        { count: 14, angle: ang, spread: 1.4, speed: 300, color: '#8dff9f', life: 0.6, size: 7 });
      return true;
    },
  },

  veil: {
    id: 'veil', name: '연막', icon: 'veil', tag: '보호',
    cost: 30, cooldown: 18, aim: 'self',
    desc: (r) => `${num(sc(3, r))}초 동안 모습을 감춥니다. 은신 중에는 빠르게 움직이고, 은신에서 나오는 첫 공격은 ${pct(2.5)} 피해가 됩니다.`,
    exec(g, p, aim, r) {
      sfx('stealth');
      p.addBuff('veil', sc(3, r), { stealth: true, speed: 1.4 });
      for (const e of g.enemiesInRadius(p.x, p.y, 900)) {
        if (e.target === p) e.loseTarget = 1.2;
      }
      fx.smoke(p.x, p.y, { count: 16, size: 50, life: 1.4, speed: 120, color: 'rgba(30,40,60,0.6)' });
      fx.ring(p.x, p.y, { r0: 20, r1: 240, color: '#4fd1b0', width: 10, life: 0.4 });
      return true;
    },
  },

  reckoning: {
    id: 'reckoning', name: '그림자 처형', icon: 'reckoning', tag: '피해', ultimate: true,
    cost: 65, cooldown: 38, aim: 'self',
    desc: (r) => `주변 적 사이를 오가며 여덟 번 베어 매번 ${pct(sc(1.6, r))} 피해를 줍니다. 베는 동안 무적입니다.`,
    exec(g, p, aim, r) {
      sfx('stealth');
      p.setInvuln(1.9);
      p.lockMove(1.8);
      fx.flash('#1b1030', 0.3, 0.35);
      let step = 0;
      const strike = () => {
        if (step >= 8 || p.dead) {
          fx.ring(p.x, p.y, { r0: 20, r1: 340, color: '#9bffe4', width: 16, life: 0.5 });
          g.circle(p.x, p.y, 300, { damage: p.dmg(sc(2.4, r), 'physical'), type: 'physical', source: p, knockback: 300 });
          g.cam.shake(0.7);
          fx.hitstop(0.1);
          return;
        }
        step++;
        const target = g.nearestEnemy(p.x, p.y, 800, () => true);
        if (target) {
          const a = angleTo(p.x, p.y, target.x, target.y) + rand(-0.9, 0.9);
          const bx = target.x - Math.cos(a) * (target.r + 54);
          const by = target.y - Math.sin(a) * (target.r + 54);
          const from = { x: p.x, y: p.y };
          g.blink(p, bx, by);
          fx.beam(from.x, from.y, p.x, p.y, { color: '#7a5cff', width: 14, life: 0.18, core: '#9bffe4' });
          g.damage(target, p.dmg(sc(1.6, r), 'physical'), { type: 'physical', source: p, crit: true, angle: a });
          fx.arc(target.x, target.y, { angle: a, spread: 2.4, radius: 110, color: '#9bffe4', width: 26, life: 0.2, swing: 1 });
          sfx('hitCrit');
          g.cam.shake(0.22);
          fx.hitstop(0.04);
        } else {
          fx.dots(p.x, p.y, { count: 8, speed: 200, color: '#7a5cff', life: 0.4, size: 9 });
        }
        g.after(0.17, strike);
      };
      strike();
      return true;
    },
  },
};

/* 랭크를 올릴 때 드는 스킬 포인트. 뒤로 갈수록 비싸진다. */
export const rankCost = (rank) => rank;

export function skillOf(id) {
  return SKILLS[id];
}

export function classSkillIds(cls) {
  return [...cls.skills, cls.ult];
}

export const MAX_RANK = 5;

export function cooldownOf(skill, cdr = 0) {
  return skill.cooldown * (1 - clamp(cdr, 0, 0.45));
}

export function distanceHint(skill) {
  return skill.aim === 'point' ? 520 : skill.aim === 'direction' ? 420 : 0;
}

export { dist };
