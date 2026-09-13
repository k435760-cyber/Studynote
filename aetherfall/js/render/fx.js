/* 타격감을 만드는 층. 파티클, 바닥 자국, 피해 숫자, 잔상, 화면 연출을 모두 담는다.
   게임 규칙은 없다. 부르는 쪽에서 "여기서 이런 일이 났다" 고 알려주면 그림만 만든다. */

import { TAU, clamp, clamp01, rand, randSign, easeOutCubic, easeOutQuint, compact } from '../core/util.js';
import { quality, settings } from '../core/settings.js';

const particles = [];        // 일반 합성
const glows = [];            // 가산 합성(빛나는 것)
const decals = [];
const texts = [];
const rings = [];
const arcs = [];
const beams = [];
const trails = [];
const lights = [];
const afterimages = [];

export const screen = { flashColor: '#ffffff', flash: 0, flashLife: 0, flashMax: 0, hitstop: 0, chroma: 0 };

function push(arr, obj, cap) {
  if (arr.length >= cap) {
    /* 넘치면 가장 오래된 것을 버린다. 최근에 난 일이 더 중요하다. */
    arr.shift();
  }
  arr.push(obj);
}

function particleCap() { return quality().particles; }

export const fx = {
  reset() {
    particles.length = 0; glows.length = 0; decals.length = 0; texts.length = 0;
    rings.length = 0; arcs.length = 0; beams.length = 0; trails.length = 0;
    lights.length = 0; afterimages.length = 0;
    screen.flash = 0; screen.hitstop = 0; screen.chroma = 0;
  },

  hitstop(sec) {
    screen.hitstop = Math.max(screen.hitstop, sec);
  },

  flash(color = '#ffffff', alpha = 0.5, life = 0.18) {
    if (settings.flash <= 0) return;
    screen.flashColor = color;
    screen.flash = Math.max(screen.flash, alpha * settings.flash);
    screen.flashMax = Math.max(life, 0.01);
    screen.flashLife = screen.flashMax;
  },

  chroma(amount = 1) {
    screen.chroma = Math.min(1.4, screen.chroma + amount);
  },

  /* 방향을 가진 불꽃. 타격 지점에서 튀는 대부분의 것. */
  sparks(x, y, opts = {}) {
    const {
      count = 10, angle = 0, spread = TAU, speed = 520, speedVar = 0.6,
      color = '#ffd9a0', life = 0.3, size = 3.4, drag = 4.4, additive = true, stretch = 1,
    } = opts;
    const n = Math.round(count * (quality().particles / 1000 + 0.35));
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = speed * (1 + (Math.random() - 0.5) * speedVar * 2);
      push(additive ? glows : particles, {
        type: 'spark', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: life * rand(0.7, 1.3), max: life, size: size * rand(0.7, 1.3),
        color, drag, stretch,
      }, particleCap());
    }
  },

  dots(x, y, opts = {}) {
    const {
      count = 8, speed = 160, color = '#9fd6ff', life = 0.6, size = 6,
      drag = 2.2, spread = TAU, angle = 0, additive = true, rise = 0,
    } = opts;
    const n = Math.round(count * (quality().particles / 1000 + 0.35));
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = speed * rand(0.35, 1.25);
      push(additive ? glows : particles, {
        type: 'dot', x: x + rand(-6, 6), y: y + rand(-6, 6),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rise,
        life: life * rand(0.7, 1.3), max: life, size: size * rand(0.6, 1.4),
        color, drag,
      }, particleCap());
    }
  },

  smoke(x, y, opts = {}) {
    const { count = 6, color = 'rgba(24,26,40,0.55)', life = 0.9, size = 26, speed = 40, rise = 18 } = opts;
    const n = Math.round(count * (quality().particles / 1000 + 0.35));
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      push(particles, {
        type: 'smoke', x: x + rand(-10, 10), y: y + rand(-10, 10),
        vx: Math.cos(a) * speed * rand(0.2, 1), vy: Math.sin(a) * speed * rand(0.2, 1) - rise,
        life: life * rand(0.7, 1.4), max: life, size: size * rand(0.7, 1.4),
        color, drag: 1.4, grow: rand(1.6, 2.8), spin: rand(-1, 1),
        rot: rand(0, TAU),
      }, particleCap());
    }
  },

  shards(x, y, opts = {}) {
    const { count = 7, color = '#c9d6ef', life = 0.7, size = 9, speed = 340, angle = 0, spread = TAU } = opts;
    const n = Math.round(count * (quality().particles / 1000 + 0.35));
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = speed * rand(0.4, 1.2);
      push(particles, {
        type: 'shard', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: life * rand(0.7, 1.3), max: life, size: size * rand(0.6, 1.4),
        color, drag: 3.2, rot: rand(0, TAU), spin: rand(-9, 9) * randSign(),
      }, particleCap());
    }
  },

  /* 퍼져 나가는 고리. 폭발·충격파·스킬 발동에 두루 쓴다. */
  ring(x, y, opts = {}) {
    const {
      r0 = 10, r1 = 180, color = '#ffd9a0', width = 8, life = 0.35,
      additive = true, fill = null, ease = 'quint', ellipse = 1,
    } = opts;
    push(rings, { x, y, r0, r1, color, width, life, max: life, additive, fill, ease, ellipse }, 220);
  },

  /* 초승달 모양 베기 자국. */
  arc(x, y, opts = {}) {
    const {
      angle = 0, spread = 1.2, radius = 120, color = '#ffffff', life = 0.22,
      width = 26, inner = 0.45, swing = 0.5,
    } = opts;
    push(arcs, { x, y, angle, spread, radius, color, life, max: life, width, inner, swing }, 90);
  },

  beam(x0, y0, x1, y1, opts = {}) {
    const { color = '#8fd9ff', width = 14, life = 0.25, core = '#ffffff', jitter = 0 } = opts;
    push(beams, { x0, y0, x1, y1, color, width, life, max: life, core, jitter }, 90);
  },

  /* 투사체 등이 남기는 짧은 꼬리. */
  trail(x, y, opts = {}) {
    const { color = '#8fd9ff', size = 12, life = 0.24 } = opts;
    push(trails, { x, y, color, size, life, max: life }, Math.max(140, particleCap() / 3));
  },

  text(x, y, str, opts = {}) {
    if (!settings.damageNumbers && opts.kind === 'damage') return;
    const {
      color = '#ffffff', size = 34, life = 0.85, crit = false,
      vx = rand(-40, 40), vy = -120, weight = 800, outline = 'rgba(6,8,16,0.85)',
    } = opts;
    push(texts, { x, y, str, color, size, life, max: life, crit, vx, vy, weight, outline }, 120);
  },

  decal(x, y, opts = {}) {
    const { kind = 'scorch', r = 60, color = 'rgba(20,10,6,0.5)', life = 14, angle = rand(0, TAU) } = opts;
    push(decals, { x, y, kind, r, color, life, max: life, angle }, quality().decals);
  },

  light(x, y, r, color, opts = {}) {
    if (!quality().lights) return;
    const { life = 0.2, intensity = 1, flicker = 0 } = opts;
    push(lights, { x, y, r, color, life, max: life, intensity, flicker }, 200);
  },

  afterimage(actor, opts = {}) {
    if (!quality().afterimages) return;
    const { color = 'rgba(160,200,255,0.5)', life = 0.28 } = opts;
    push(afterimages, {
      x: actor.x, y: actor.y, facing: actor.facing, r: actor.r,
      color, life, max: life, classId: actor.classId || null, kind: actor.kind || 'enemy',
    }, 60);
  },

  /* 자주 쓰는 조합들 --------------------------------------------------- */

  impact(x, y, angle, color = '#ffd9a0', power = 1) {
    fx.sparks(x, y, { count: 8 * power, angle, spread: 1.5, speed: 480 * power, color, life: 0.26, size: 3.6 });
    fx.ring(x, y, { r0: 6, r1: 46 * power, color, width: 5, life: 0.2 });
    fx.light(x, y, 180 * power, color, { life: 0.16, intensity: 0.8 });
  },

  bloodBurst(x, y, angle, color = '#7d2b4a') {
    fx.dots(x, y, { count: 10, angle, spread: 1.8, speed: 300, color, life: 0.5, size: 7, additive: false, drag: 5 });
    fx.decal(x + rand(-14, 14), y + rand(-14, 14), { kind: 'blood', r: rand(26, 46), color: 'rgba(96,22,44,0.42)', life: 20 });
  },

  explosion(x, y, radius, color = '#ff9a4d', opts = {}) {
    const { shards: withShards = true, smoke: withSmoke = true } = opts;
    fx.ring(x, y, { r0: radius * 0.2, r1: radius * 1.15, color, width: 14, life: 0.34 });
    fx.ring(x, y, { r0: radius * 0.1, r1: radius * 0.8, color: '#ffffff', width: 6, life: 0.22 });
    fx.sparks(x, y, { count: 22, speed: radius * 4.4, color, life: 0.42, size: 4.4 });
    if (withShards) fx.shards(x, y, { count: 8, color, speed: radius * 3, life: 0.5 });
    if (withSmoke) fx.smoke(x, y, { count: 7, size: radius * 0.45, life: 1.1 });
    fx.light(x, y, radius * 3, color, { life: 0.3, intensity: 1.3 });
    fx.decal(x, y, { kind: 'scorch', r: radius * 0.7, color: 'rgba(18,8,4,0.45)', life: 16 });
  },

  /* --- 갱신 ------------------------------------------------------------ */

  update(dt) {
    if (screen.flashLife > 0) {
      screen.flashLife -= dt;
      screen.flash = screen.flash * Math.max(0, screen.flashLife / screen.flashMax);
      if (screen.flashLife <= 0) screen.flash = 0;
    }
    screen.chroma = Math.max(0, screen.chroma - dt * 3.2);

    for (const p of particles) stepParticle(p, dt);
    for (const p of glows) stepParticle(p, dt);
    compact(particles, (p) => p.life > 0);
    compact(glows, (p) => p.life > 0);

    for (const t of texts) {
      t.life -= dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy += 210 * dt;
      t.vx *= 1 - dt * 2.4;
    }
    compact(texts, (t) => t.life > 0);

    for (const r of rings) r.life -= dt;
    compact(rings, (r) => r.life > 0);
    for (const a of arcs) a.life -= dt;
    compact(arcs, (a) => a.life > 0);
    for (const b of beams) b.life -= dt;
    compact(beams, (b) => b.life > 0);
    for (const t of trails) t.life -= dt;
    compact(trails, (t) => t.life > 0);
    for (const l of lights) l.life -= dt;
    compact(lights, (l) => l.life > 0);
    for (const a of afterimages) a.life -= dt;
    compact(afterimages, (a) => a.life > 0);
    for (const d of decals) d.life -= dt;
    compact(decals, (d) => d.life > 0);
  },
};

function stepParticle(p, dt) {
  p.life -= dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const d = 1 - Math.min(0.96, p.drag * dt);
  p.vx *= d;
  p.vy *= d;
  if (p.spin) p.rot += p.spin * dt;
  if (p.grow) p.size += p.grow * 60 * dt;
}

/* --- 그리기 ------------------------------------------------------------ */

export function drawDecals(ctx) {
  for (const d of decals) {
    const t = clamp01(d.life / d.max);
    const a = t > 0.8 ? 1 : t / 0.8;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(d.x, d.y);
    ctx.rotate(d.angle);
    if (d.kind === 'scorch' || d.kind === 'blood') {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, d.r);
      g.addColorStop(0, d.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, d.r, d.r * 0.78, 0, 0, TAU);
      ctx.fill();
    } else if (d.kind === 'ice') {
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * d.r, Math.sin(ang) * d.r * 0.8);
        ctx.stroke();
      }
    } else if (d.kind === 'rune') {
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, 0, d.r, d.r * 0.8, 0, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, d.r * 0.6, d.r * 0.48, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawAfterimages(ctx, drawSilhouette) {
  for (const a of afterimages) {
    const t = clamp01(a.life / a.max);
    ctx.save();
    ctx.globalAlpha = t * 0.55;
    ctx.globalCompositeOperation = 'lighter';
    drawSilhouette(ctx, a, t);
    ctx.restore();
  }
}

function paintParticle(ctx, p) {
  const t = clamp01(p.life / p.max);
  ctx.globalAlpha = t;
  if (p.type === 'spark') {
    const sp = Math.hypot(p.vx, p.vy);
    const len = Math.min(60, sp * 0.035 * p.stretch);
    const ang = Math.atan2(p.vy, p.vx);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.size * t;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
    ctx.stroke();
  } else if (p.type === 'dot') {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.35 + t * 0.65), 0, TAU);
    ctx.fill();
  } else if (p.type === 'smoke') {
    ctx.globalAlpha = t * 0.7;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  } else if (p.type === 'shard') {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    const s = p.size * (0.4 + t * 0.6);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.5, s * 0.7);
    ctx.lineTo(-s * 0.5, s * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function drawParticles(ctx) {
  ctx.save();
  for (const p of particles) paintParticle(ctx, p);
  ctx.restore();
}

export function drawGlows(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const t of trails) {
    const k = clamp01(t.life / t.max);
    ctx.globalAlpha = k * 0.5;
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.size * k, 0, TAU);
    ctx.fill();
  }

  for (const p of glows) paintParticle(ctx, p);

  for (const r of rings) {
    const k = 1 - clamp01(r.life / r.max);
    const e = r.ease === 'cubic' ? easeOutCubic(k) : easeOutQuint(k);
    const rad = r.r0 + (r.r1 - r.r0) * e;
    ctx.globalAlpha = (1 - k) * (r.additive ? 0.9 : 0.6);
    if (!r.additive) ctx.globalCompositeOperation = 'source-over';
    if (r.fill) {
      ctx.fillStyle = r.fill;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rad, rad * r.ellipse, 0, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = r.color;
    ctx.lineWidth = Math.max(1, r.width * (1 - k));
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, rad, rad * r.ellipse, 0, 0, TAU);
    ctx.stroke();
    if (!r.additive) ctx.globalCompositeOperation = 'lighter';
  }

  for (const a of arcs) {
    const k = 1 - clamp01(a.life / a.max);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.angle + a.swing * k);
    ctx.globalAlpha = (1 - k) * 0.95;
    const grad = ctx.createRadialGradient(0, 0, a.radius * a.inner, 0, 0, a.radius * (0.9 + k * 0.25));
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.72, a.color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = a.width * (1 - k * 0.5);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, a.radius * (0.85 + k * 0.25), -a.spread / 2, a.spread / 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const b of beams) {
    const k = clamp01(b.life / b.max);
    ctx.globalAlpha = k;
    ctx.lineCap = 'round';
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.width * k;
    ctx.beginPath();
    ctx.moveTo(b.x0, b.y0);
    ctx.lineTo(b.x1, b.y1);
    ctx.stroke();
    ctx.strokeStyle = b.core;
    ctx.lineWidth = Math.max(1, b.width * k * 0.34);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawTexts(ctx, scale) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of texts) {
    const k = clamp01(t.life / t.max);
    const pop = t.max - t.life < 0.09 ? 1 + (0.09 - (t.max - t.life)) * 4.4 : 1;
    ctx.globalAlpha = k > 0.55 ? 1 : k / 0.55;
    const size = t.size * pop;
    ctx.font = `${t.weight} ${size}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
    ctx.lineWidth = Math.max(2, size * 0.14);
    ctx.strokeStyle = t.outline;
    ctx.lineJoin = 'round';
    ctx.strokeText(t.str, t.x, t.y);
    if (t.crit) {
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 18 * scale;
    }
    ctx.fillStyle = t.color;
    ctx.fillText(t.str, t.x, t.y);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/* 빛은 프레임마다 수십 개씩 그린다. 그때마다 그라디언트를 새로 만들면
   그 비용이 만만치 않아, 색깔별로 한 번만 그려 두고 크기만 바꿔 붙인다. */
const lightSprites = new Map();

export function lightSprite(color) {
  let sprite = lightSprites.get(color);
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = 128;
  const c = sprite.getContext('2d');
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(0.45, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  if (lightSprites.size > 80) lightSprites.clear();
  lightSprites.set(color, sprite);
  return sprite;
}

export function drawLights(ctx) {
  for (const l of lights) {
    const k = clamp01(l.life / l.max);
    const r = l.r * (0.7 + k * 0.3);
    const flick = l.flicker ? 1 - Math.random() * l.flicker : 1;
    ctx.globalAlpha = clamp(k * l.intensity * flick, 0, 1);
    ctx.drawImage(lightSprite(l.color), l.x - r, l.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

export function fxStats() {
  return particles.length + glows.length + trails.length + decals.length;
}
