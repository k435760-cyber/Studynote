/* 화면에 보이는 모든 것. 그림 파일을 쓰지 않고 전부 코드로 그린다.
   덕분에 어떤 해상도에서도 뭉개지지 않고, 색만 바꿔도 분위기가 통째로 바뀐다. */

import { TAU, clamp01, lerp, rand } from '../core/util.js';
import { quality } from '../core/settings.js';
import { TILE, WALL, FLOOR } from '../game/dungeon.js';
import { fx, screen, drawDecals, drawParticles, drawGlows, drawTexts, drawLights, drawAfterimages, lightSprite } from './fx.js';

const FLOOR_VARIANTS = 6;

/* 타일은 한 번만 그려서 캐시해 두고, 매 프레임에는 붙여 넣기만 한다. */
function buildTileAtlas() {
  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = size * FLOOR_VARIANTS;
  canvas.height = size * 2;
  const c = canvas.getContext('2d');

  for (let v = 0; v < FLOOR_VARIANTS; v++) {
    const x = v * size;
    const base = 21 + v * 1.6;
    c.fillStyle = `rgb(${base + 5},${base + 7},${base + 15})`;
    c.fillRect(x, 0, size, size);

    /* 돌 결. 같은 패턴이 반복돼 보이지 않게 변주를 여섯 개 만든다. */
    for (let i = 0; i < 22; i++) {
      const a = 0.02 + Math.random() * 0.05;
      c.fillStyle = `rgba(${140 + Math.random() * 60},${150 + Math.random() * 60},${180 + Math.random() * 50},${a})`;
      const w = 8 + Math.random() * 40;
      const h = 4 + Math.random() * 18;
      c.fillRect(x + Math.random() * (size - w), Math.random() * (size - h), w, h);
    }
    c.strokeStyle = 'rgba(0,0,0,0.13)';
    c.lineWidth = 1.2;
    c.strokeRect(x + 0.75, 0.75, size - 1.5, size - 1.5);
    c.strokeStyle = 'rgba(255,255,255,0.03)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x + 2, 2);
    c.lineTo(x + size - 2, 2);
    c.stroke();
  }

  for (let v = 0; v < FLOOR_VARIANTS; v++) {
    const x = v * size;
    const base = 44 + v * 3;
    const g = c.createLinearGradient(x, size, x, size * 2);
    g.addColorStop(0, `rgb(${base + 10},${base + 12},${base + 24})`);
    g.addColorStop(1, `rgb(${base - 8},${base - 6},${base + 6})`);
    c.fillStyle = g;
    c.fillRect(x, size, size, size);
    for (let i = 0; i < 10; i++) {
      c.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.08})`;
      const w = 12 + Math.random() * 50;
      const h = 6 + Math.random() * 22;
      c.fillRect(x + Math.random() * (size - w), size + Math.random() * (size - h), w, h);
    }
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = 3;
    c.strokeRect(x + 1.5, size + 1.5, size - 3, size - 3);
  }

  return canvas;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.atlas = buildTileAtlas();
    this.light = document.createElement('canvas');
    this.lightCtx = this.light.getContext('2d');
    this.bloom = document.createElement('canvas');
    this.bloomCtx = this.bloom.getContext('2d');
    this.w = 0; this.h = 0;
    this.time = 0;
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.light.width = Math.max(2, Math.floor(w / 2));
    this.light.height = Math.max(2, Math.floor(h / 2));
    this.bloom.width = Math.max(2, Math.floor(w / 5));
    this.bloom.height = Math.max(2, Math.floor(h / 5));
  }

  render(game, cam, dt) {
    const ctx = this.ctx;
    const q = quality();
    this.time += dt;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07090f';
    ctx.fillRect(0, 0, this.w, this.h);

    if (!game.level) return;
    cam.apply(ctx, this.w, this.h);
    const view = cam.viewRect(TILE);

    this.drawFloor(ctx, game.level, view);
    drawDecals(ctx);
    this.drawZones(ctx, game);
    this.drawTelegraphs(ctx, game);
    this.drawProps(ctx, game.level, view, false);
    this.drawInteractables(ctx, game);
    this.drawPickups(ctx, game);
    drawAfterimages(ctx, (c, a, t) => paintSilhouette(c, a, t));

    /* 뒤에 있는 것부터 그려야 겹침이 자연스럽다. */
    const actors = [...game.enemies];
    if (!game.player.dead) actors.push(game.player);
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) {
      if (a.x < view.x - 200 || a.x > view.x + view.w + 200) continue;
      if (a.y < view.y - 200 || a.y > view.y + view.h + 200) continue;
      if (a.kind === 'player') paintPlayer(ctx, a, this.time);
      else paintEnemy(ctx, a, this.time);
    }

    this.drawProjectiles(ctx, game);
    drawParticles(ctx);
    drawGlows(ctx);
    this.drawWalls(ctx, game.level, view);
    this.drawProps(ctx, game.level, view, true);

    if (q.lights) this.lightPass(ctx, game, cam);
    drawTexts(ctx, cam.scale * cam.zoom);
    if (q.bloom) this.bloomPass(ctx);
    this.overlay(ctx, game);
  }

  drawFloor(ctx, level, view) {
    const x0 = Math.max(0, Math.floor(view.x / TILE));
    const x1 = Math.min(level.w - 1, Math.ceil((view.x + view.w) / TILE));
    const y0 = Math.max(0, Math.floor(view.y / TILE));
    const y1 = Math.min(level.h - 1, Math.ceil((view.y + view.h) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (level.tiles[ty * level.w + tx] !== FLOOR) continue;
        const v = level.variant[ty * level.w + tx];
        ctx.drawImage(this.atlas, v * 128, 0, 128, 128, tx * TILE, ty * TILE, TILE, TILE);
      }
    }
  }

  drawWalls(ctx, level, view) {
    const x0 = Math.max(0, Math.floor(view.x / TILE) - 1);
    const x1 = Math.min(level.w - 1, Math.ceil((view.x + view.w) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(view.y / TILE) - 1);
    const y1 = Math.min(level.h - 1, Math.ceil((view.y + view.h) / TILE) + 1);
    const lip = 34;

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (level.tiles[ty * level.w + tx] !== WALL) continue;
        const openBelow = level.tileAt(tx, ty + 1) === FLOOR;
        const nearFloor = openBelow
          || level.tileAt(tx, ty - 1) === FLOOR
          || level.tileAt(tx - 1, ty) === FLOOR
          || level.tileAt(tx + 1, ty) === FLOOR;
        if (!nearFloor) continue;
        const v = level.variant[ty * level.w + tx];
        const px = tx * TILE, py = ty * TILE;
        ctx.drawImage(this.atlas, v * 128, 128, 128, 128, px, py - lip, TILE, TILE);
        if (openBelow) {
          /* 벽 아랫면. 두께가 보여야 위에서 내려다보는 느낌이 산다. */
          const g = ctx.createLinearGradient(0, py + TILE - lip, 0, py + TILE);
          g.addColorStop(0, 'rgba(18,20,32,0.95)');
          g.addColorStop(1, 'rgba(8,9,16,1)');
          ctx.fillStyle = g;
          ctx.fillRect(px, py + TILE - lip, TILE, lip);
          ctx.fillStyle = 'rgba(120,150,210,0.08)';
          ctx.fillRect(px, py + TILE - lip, TILE, 3);
        }
      }
    }

    /* 횃불 */
    for (const t of level.torches) {
      if (t.x < view.x || t.x > view.x + view.w || t.y < view.y || t.y > view.y + view.h) continue;
      const flick = 0.75 + Math.sin(this.time * 9 + t.phase) * 0.12 + Math.random() * 0.08;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, 64 * flick);
      g.addColorStop(0, 'rgba(255,190,110,0.9)');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 64 * flick, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#2a2118';
      ctx.fillRect(t.x - 5, t.y - 6, 10, 26);
    }
  }

  drawProps(ctx, level, view, tall) {
    for (const p of level.props) {
      if (p.x < view.x - 100 || p.x > view.x + view.w + 100) continue;
      if (p.y < view.y - 140 || p.y > view.y + view.h + 140) continue;
      if (tall !== (p.kind === 'pillar')) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + p.r * 0.5, p.r * 1.05, p.r * 0.5, 0, 0, TAU);
      ctx.fill();
      if (p.kind === 'pillar') {
        const g = ctx.createLinearGradient(p.x - p.r, 0, p.x + p.r, 0);
        g.addColorStop(0, '#2b3044');
        g.addColorStop(0.45, '#454d69');
        g.addColorStop(1, '#1d2130');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.r * 0.72, p.y - p.r * 2.1, p.r * 1.44, p.r * 2.4);
        ctx.fillStyle = '#525b7a';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - p.r * 2.1, p.r * 0.78, p.r * 0.32, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = '#343a4e';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.62, 0.3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#434a62';
        ctx.beginPath();
        ctx.ellipse(p.x - p.r * 0.2, p.y - p.r * 0.2, p.r * 0.5, p.r * 0.3, 0.7, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawZones(ctx, game) {
    for (const z of game.zones) {
      const t = clamp01(z.life / z.max);
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(this.time * 4) * 0.08;
      const g = ctx.createRadialGradient(z.x, z.y, z.radius * 0.2, z.x, z.y, z.radius);
      g.addColorStop(0, z.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, z.radius, z.radius * 0.82, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.45 * t;
      ctx.strokeStyle = z.color.replace(/[\d.]+\)$/, '0.85)');
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 14]);
      ctx.lineDashOffset = -this.time * 40;
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, z.radius, z.radius * 0.82, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawTelegraphs(ctx, game) {
    for (const t of game.telegraphs) {
      const k = 1 - clamp01(t.time / t.max);
      ctx.save();
      ctx.globalAlpha = 0.24 + k * 0.3;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, t.radius * k, t.radius * k * 0.82, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, t.radius, t.radius * 0.82, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawInteractables(ctx, game) {
    const level = game.level;
    for (const c of level.chests) {
      if (c.opened) continue;
      const bob = Math.sin(this.time * 2.4) * 3;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 22, 40, 16, 0, 0, TAU);
      ctx.fill();
      ctx.translate(c.x, c.y + bob);
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(-34, -26, 68, 46);
      ctx.fillStyle = '#8a6238';
      ctx.fillRect(-34, -26, 68, 14);
      ctx.fillStyle = '#e2c98a';
      ctx.fillRect(-7, -12, 14, 16);
      ctx.restore();
      glowRing(ctx, c.x, c.y, 54 + Math.sin(this.time * 3) * 6, 'rgba(226,201,138,0.5)');
    }
    for (const s of level.shrines) {
      if (s.used) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 20, 34, 14, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#39415c';
      ctx.fillRect(-18, -14, 36, 34);
      ctx.fillStyle = '#4d5878';
      ctx.fillRect(-24, -20, 48, 10);
      const pulse = 0.7 + Math.sin(this.time * 3.2) * 0.3;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, -40, 0, 0, -40, 46 * pulse);
      g.addColorStop(0, 'rgba(169,231,255,0.9)');
      g.addColorStop(1, 'rgba(169,231,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -40, 46 * pulse, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    if (game.portal) {
      const p = game.portal;
      const t = this.time;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const rr = 40 + i * 16 + Math.sin(t * 2 + i) * 8;
        ctx.strokeStyle = `rgba(159,228,255,${0.5 - i * 0.1})`;
        ctx.lineWidth = 6 - i;
        ctx.beginPath();
        ctx.ellipse(0, 0, rr, rr * 0.82, t * (0.4 + i * 0.2), 0, TAU);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 90);
      g.addColorStop(0, 'rgba(200,245,255,0.7)');
      g.addColorStop(1, 'rgba(80,160,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 90, 0, TAU);
      ctx.fill();
      ctx.restore();
      if (Math.random() < 0.4) {
        fx.dots(p.x + rand(-40, 40), p.y + rand(-40, 40), { count: 1, speed: 40, color: '#9fe4ff', life: 0.9, size: 6, rise: 80 });
      }
    }
  }

  drawPickups(ctx, game) {
    for (const p of game.pickups) {
      const bob = Math.sin(this.time * 5 + p.id) * 4;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.globalCompositeOperation = 'lighter';
      let color = '#9fd6ff', size = 9;
      if (p.kind === 'aether') { color = '#a9e7ff'; size = 12; }
      else if (p.kind === 'heal') { color = '#8fe3a5'; size = 13; }
      else if (p.kind === 'item') { color = '#ffd48a'; size = 15; }
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.6);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, size * 2.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (p.kind === 'item') {
        ctx.rotate(this.time * 1.4);
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.8, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(-size * 0.8, 0);
        ctx.closePath();
      } else {
        ctx.arc(0, 0, size * 0.42, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }
  }

  drawProjectiles(ctx, game) {
    for (const p of game.projectiles) {
      const ang = Math.atan2(p.vy, p.vx);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      const r = p.radius;
      /* 가운데는 또렷하게, 바깥은 부드럽게. 너무 번지면 뭉개진 빛덩이로 보인다. */
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.7);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.42, p.color);
      g.addColorStop(0.72, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      if (p.sprite === 'shard') {
        ctx.beginPath();
        ctx.moveTo(r * 1.6, 0);
        ctx.lineTo(-r, r * 0.7);
        ctx.lineTo(-r * 0.5, 0);
        ctx.lineTo(-r, -r * 0.7);
        ctx.closePath();
        ctx.fill();
      } else if (p.sprite === 'bolt') {
        ctx.fillRect(-r * 2.2, -r * 0.32, r * 3.4, r * 0.64);
        ctx.beginPath();
        ctx.arc(r * 1.1, 0, r * 0.7, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.7, r * 1.15, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  lightPass(ctx, game, cam) {
    const lc = this.lightCtx;
    const s = 0.5;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.fillStyle = game.level.boss ? '#514a66' : '#464e63';
    lc.fillRect(0, 0, this.light.width, this.light.height);

    const scale = cam.scale * cam.zoom * s;
    lc.setTransform(scale, 0, 0, scale,
      this.light.width / 2 - (cam.x + cam.shakeX) * scale,
      this.light.height / 2 - (cam.y + cam.shakeY) * scale);
    lc.globalCompositeOperation = 'lighter';

    const view = cam.viewRect(240);
    const addLight = (x, y, r, color, alpha = 1) => {
      if (x < view.x - r || x > view.x + view.w + r || y < view.y - r || y > view.y + view.h + r) return;
      lc.globalAlpha = alpha;
      lc.drawImage(lightSprite(color), x - r, y - r, r * 2, r * 2);
    };

    for (const t of game.level.torches) {
      const flick = 0.85 + Math.sin(this.time * 8 + t.phase) * 0.1;
      addLight(t.x, t.y, 460 * flick, 'rgba(255,175,95,0.95)');
    }
    const p = game.player;
    if (!p.dead) addLight(p.x, p.y, 760, 'rgba(198,220,255,0.98)');
    /* 투사체가 수십 개씩 날아다닐 때가 있어 빛은 앞쪽 몇 개만 넣는다. */
    const maxProjectileLights = 24;
    for (let i = 0; i < game.projectiles.length && i < maxProjectileLights; i++) {
      const pr = game.projectiles[i];
      addLight(pr.x, pr.y, 220, hexToRgba(pr.color, 0.8));
    }
    for (const z of game.zones) addLight(z.x, z.y, z.radius * 1.2, z.color, 0.7);
    if (game.portal) addLight(game.portal.x, game.portal.y, 520, 'rgba(150,225,255,0.9)');
    for (const c of game.level.chests) if (!c.opened) addLight(c.x, c.y, 260, 'rgba(226,201,138,0.7)');
    for (const e of game.enemies) {
      if (e.tier === 'boss') addLight(e.x, e.y, 520, hexToRgba(e.def.color, 0.7));
      else if (e.telegraph) addLight(e.x, e.y, 240, hexToRgba(e.def.color, 0.5));
    }
    drawLights(lc);

    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'source-over';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.light, 0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'source-over';
    cam.apply(ctx, this.w, this.h);
  }

  bloomPass(ctx) {
    const bc = this.bloomCtx;
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, this.bloom.width, this.bloom.height);
    bc.filter = 'brightness(1.45) saturate(1.2) blur(3px)';
    bc.drawImage(this.canvas, 0, 0, this.bloom.width, this.bloom.height);
    bc.filter = 'none';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22;
    ctx.drawImage(this.bloom, 0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  overlay(ctx, game) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const p = game.player;

    /* 가장자리 어둠. 화면 한가운데로 시선을 모은다. */
    const vig = ctx.createRadialGradient(
      this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.34,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.w, this.h);

    const hpRatio = p.hp / p.maxHp;
    if (hpRatio < 0.35 && !p.dead) {
      const pulse = 0.35 + Math.sin(this.time * 5) * 0.18;
      const g = ctx.createRadialGradient(
        this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3,
        this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
      g.addColorStop(0, 'rgba(190,20,30,0)');
      g.addColorStop(1, `rgba(190,20,30,${(1 - hpRatio / 0.35) * pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    if (screen.flash > 0.001) {
      /* 화면을 통째로 덮으면 앞이 안 보인다. 가장자리를 세게, 가운데는 옅게. */
      const a = clamp01(screen.flash);
      const edge = ctx.createRadialGradient(
        this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.18,
        this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.62);
      edge.addColorStop(0, hexToRgba(screen.flashColor, 0));
      edge.addColorStop(1, hexToRgba(screen.flashColor, a));
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = a * 0.34;
      ctx.fillStyle = screen.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
  }
}

function hexToRgba(hex, a) {
  if (!hex || hex[0] !== '#') return `rgba(255,255,255,${a})`;
  const v = hex.slice(1);
  const n = v.length === 3
    ? parseInt(v[0] + v[0] + v[1] + v[1] + v[2] + v[2], 16)
    : parseInt(v, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function glowRing(ctx, x, y, r, color) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y + 10, r, r * 0.4, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/* 인물 뒤에 까는 어두운 테두리. 배경이 밝든 어둡든 실루엣이 살아난다. */
function rim(ctx, rx, ry) {
  ctx.fillStyle = 'rgba(5,7,14,0.78)';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx + 4, ry + 4, 0, 0, TAU);
  ctx.fill();
}

function shadow(ctx, a) {
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(a.x, a.y + a.r * 0.62, a.r * 0.92, a.r * 0.4, 0, 0, TAU);
  ctx.fill();
}

/* 잔상용 단순 실루엣 */
export function paintSilhouette(ctx, a, t) {
  ctx.fillStyle = a.color;
  ctx.beginPath();
  ctx.ellipse(a.x, a.y, a.r * 0.8, a.r * 0.95, 0, 0, TAU);
  ctx.fill();
}

function statusTint(ctx, a) {
  if (a.status.freeze) return 'rgba(150,220,255,0.55)';
  if (a.status.chill) return 'rgba(150,220,255,0.28)';
  if (a.status.burn) return 'rgba(255,140,60,0.3)';
  if (a.status.poison) return 'rgba(140,220,110,0.3)';
  if (a.status.shock) return 'rgba(180,220,255,0.3)';
  return null;
}

function paintPlayer(ctx, p, time) {
  const c = p.colors;
  const walk = Math.sin(time * 12) * clamp01(p.moving) * 1;
  ctx.save();
  if (p.stealthed) ctx.globalAlpha = 0.4;
  shadow(ctx, p);
  ctx.translate(p.x, p.y - 6 + Math.abs(walk) * 3);
  ctx.rotate(p.facing);
  rim(ctx, 24, 20);

  /* 망토 — 움직이는 반대쪽으로 흔들린다 */
  ctx.fillStyle = c.cloth;
  ctx.beginPath();
  ctx.moveTo(-6, -18);
  ctx.quadraticCurveTo(-46 - clamp01(p.moving) * 16, -10 + walk * 5, -34, 0);
  ctx.quadraticCurveTo(-46 - clamp01(p.moving) * 16, 10 + walk * 5, -6, 18);
  ctx.closePath();
  ctx.fill();

  /* 다리 */
  ctx.fillStyle = '#20232f';
  ctx.beginPath();
  ctx.ellipse(2 + walk * 6, -11, 9, 6, 0, 0, TAU);
  ctx.ellipse(2 - walk * 6, 11, 9, 6, 0, 0, TAU);
  ctx.fill();

  /* 몸통 */
  const body = ctx.createLinearGradient(-18, 0, 20, 0);
  body.addColorStop(0, shade(c.primary, -0.35));
  body.addColorStop(0.6, c.primary);
  body.addColorStop(1, shade(c.primary, 0.18));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 16, 0, 0, TAU);
  ctx.fill();

  /* 어깨 장식 */
  ctx.fillStyle = c.trim;
  ctx.beginPath();
  ctx.ellipse(-2, -15, 8, 5, -0.4, 0, TAU);
  ctx.ellipse(-2, 15, 8, 5, 0.4, 0, TAU);
  ctx.fill();

  /* 머리 */
  ctx.fillStyle = shade(c.primary, 0.3);
  ctx.beginPath();
  ctx.arc(7, 0, 11, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.glow;
  ctx.beginPath();
  ctx.ellipse(13, 0, 3.4, 5, 0, 0, TAU);
  ctx.fill();

  paintWeapon(ctx, p, time);

  const tint = statusTint(ctx, p);
  if (tint) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 22, 0, 0, TAU);
    ctx.fill();
  }
  if (p.hitFlash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = p.hitFlash * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 20, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  if (p.shield > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(159,196,255,0.75)';
    ctx.lineWidth = 3;
    const rr = p.r + 16 + Math.sin(time * 6) * 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU;
      const a1 = a0 + TAU / 6 * 0.7;
      ctx.moveTo(p.x + Math.cos(a0) * rr, p.y + Math.sin(a0) * rr * 0.9);
      ctx.arc(p.x, p.y, rr, a0, a1);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (p.buffs.bloodlust) auraRing(ctx, p, time, 'rgba(255,90,60,0.5)');
  if (p.buffs.resolve || p.buffs.aegis) auraRing(ctx, p, time, 'rgba(159,196,255,0.5)');
  if (p.buffs.mend || p.buffs.covenant) auraRing(ctx, p, time, 'rgba(255,233,168,0.5)');
}

function auraRing(ctx, a, time, color) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(a.x, a.y + 10, a.r * 1.5, a.r * 0.6, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function paintWeapon(ctx, p, time) {
  const c = p.colors;
  const swing = p.swing;
  const base = swing > 0 ? lerp(-1.1, 1.1, 1 - swing) * p.swingDir : Math.sin(time * 3) * 0.08;
  ctx.save();
  ctx.rotate(base);
  const cls = p.classId;
  if (cls === 'guardian') {
    ctx.fillStyle = shade(c.primary, -0.2);
    ctx.beginPath();
    ctx.moveTo(11, -30);
    ctx.lineTo(17, -30);
    ctx.quadraticCurveTo(22, -30, 22, -24);
    ctx.lineTo(22, -2);
    ctx.quadraticCurveTo(22, 4, 14, 4);
    ctx.quadraticCurveTo(6, 4, 6, -2);
    ctx.lineTo(6, -24);
    ctx.quadraticCurveTo(6, -30, 11, -30);
    ctx.fill();
    ctx.fillStyle = c.trim;
    ctx.beginPath();
    ctx.arc(14, -13, 5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#cfd7e6';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(8, 14);
    ctx.lineTo(40, 22);
    ctx.stroke();
  } else if (cls === 'berserker') {
    ctx.strokeStyle = '#7b6450';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(4, 8);
    ctx.lineTo(44, 20);
    ctx.stroke();
    ctx.fillStyle = '#d8dee9';
    ctx.beginPath();
    ctx.moveTo(40, 8);
    ctx.lineTo(58, 20);
    ctx.lineTo(40, 34);
    ctx.quadraticCurveTo(36, 20, 40, 8);
    ctx.fill();
  } else if (cls === 'arcanist') {
    ctx.strokeStyle = '#6a5a86';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(4, 10);
    ctx.lineTo(34, 26);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(36, 28, 0, 36, 28, 18);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, c.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(36, 28, 18, 0, TAU);
    ctx.fill();
  } else if (cls === 'oracle') {
    ctx.strokeStyle = '#b49a5e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(2, 12);
    ctx.lineTo(30, 28);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = c.glow;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 30, 11, 0, TAU);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#d5e3ea';
    ctx.beginPath();
    ctx.moveTo(8, -12);
    ctx.lineTo(34, -18);
    ctx.lineTo(10, -6);
    ctx.closePath();
    ctx.moveTo(8, 12);
    ctx.lineTo(34, 18);
    ctx.lineTo(10, 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function paintEnemy(ctx, e, time) {
  const def = e.def;
  const col = def.color;
  const wob = Math.sin(time * 6 + e.animTime) * 2;
  ctx.save();
  shadow(ctx, e);
  ctx.translate(e.x, e.y - (def.flying ? 12 + wob : 4));
  ctx.rotate(e.facing);
  rim(ctx, e.r * 0.95, e.r * 0.86);

  const s = e.r / 28;
  if (e.tier === 'boss') paintBoss(ctx, e, time, s);
  else if (def.silhouette === 'stalker') {
    ctx.fillStyle = shade(col, -0.25);
    ctx.beginPath();
    ctx.ellipse(0, 0, 24 * s, 13 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(14 * s, 0, 11 * s, 9 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd9e6';
    ctx.fillRect(18 * s, -5 * s, 4 * s, 2.4 * s);
    ctx.fillRect(18 * s, 3 * s, 4 * s, 2.4 * s);
    ctx.strokeStyle = shade(col, -0.4);
    ctx.lineWidth = 3 * s;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-4 * s - i * 6 * s, -8 * s);
      ctx.lineTo(-8 * s - i * 6 * s, -16 * s);
      ctx.stroke();
    }
  } else if (def.silhouette === 'wraith') {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = shade(col, -0.2);
    ctx.beginPath();
    ctx.moveTo(16 * s, 0);
    ctx.quadraticCurveTo(0, -20 * s, -18 * s, -8 * s + wob);
    ctx.quadraticCurveTo(-26 * s, 0, -18 * s, 8 * s - wob);
    ctx.quadraticCurveTo(0, 20 * s, 16 * s, 0);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(8 * s, -3 * s, 3 * s, 0, TAU);
    ctx.arc(8 * s, 3 * s, 3 * s, 0, TAU);
    ctx.fill();
  } else if (def.silhouette === 'brute' || def.silhouette === 'sentinel') {
    ctx.fillStyle = shade(col, -0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 26 * s, 24 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(4 * s, 0, 20 * s, 18 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = shade(col, 0.3);
    ctx.beginPath();
    ctx.arc(14 * s, 0, 9 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffc9a0';
    ctx.beginPath();
    ctx.arc(18 * s, -3 * s, 2.6 * s, 0, TAU);
    ctx.arc(18 * s, 3 * s, 2.6 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = shade(col, -0.45);
    ctx.fillRect(-4 * s, -30 * s, 10 * s, 12 * s);
    ctx.fillRect(-4 * s, 18 * s, 10 * s, 12 * s);
  } else {
    /* 사람 형태의 기본 적 */
    ctx.fillStyle = shade(col, -0.35);
    ctx.beginPath();
    ctx.ellipse(-4 * s, 0, 16 * s, 14 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15 * s, 12 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = shade(col, 0.25);
    ctx.beginPath();
    ctx.arc(9 * s, 0, 8 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a1c26';
    ctx.beginPath();
    ctx.ellipse(13 * s, 0, 3 * s, 4 * s, 0, 0, TAU);
    ctx.fill();
    if (def.silhouette === 'archer' || def.silhouette === 'hexer' || def.silhouette === 'warden') {
      ctx.strokeStyle = shade(col, -0.5);
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(6 * s, 10 * s);
      ctx.lineTo(26 * s, 20 * s);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(27 * s, 21 * s, 4 * s, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (def.silhouette === 'spitter') {
      ctx.fillStyle = shade(col, 0.4);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-8 * s + i * 5 * s, -10 * s + i * 9 * s, 4 * s, 0, TAU);
        ctx.fill();
      }
    }
  }

  if (e.telegraph) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + Math.sin(time * 24) * 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, e.r * 0.9, e.r * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const tint = statusTint(ctx, e);
  if (tint) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.r, e.r * 0.9, 0, 0, TAU);
    ctx.fill();
  }
  if (e.hitFlash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = e.hitFlash * 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, e.r * 0.95, e.r * 0.85, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  if (e.tier !== 'boss') drawEnemyBar(ctx, e);
  if (e.telegraph && e.telegraph.kind === 'melee') {
    const k = 1 - clamp01(e.telegraph.time / e.telegraph.max);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22 + k * 0.25;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.arc(e.x, e.y, e.telegraph.range, e.facing - e.telegraph.arc / 2, e.facing + e.telegraph.arc / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawEnemyBar(ctx, e) {
  if (e.hp >= e.maxHp) return;
  const w = Math.max(44, e.r * 1.8);
  const x = e.x - w / 2;
  const y = e.y - e.r - 20;
  ctx.fillStyle = 'rgba(6,8,14,0.72)';
  ctx.fillRect(x - 1, y - 1, w + 2, 8);
  ctx.fillStyle = e.tier === 'elite' ? '#f0a24e' : '#d2495a';
  ctx.fillRect(x, y, w * clamp01(e.hp / e.maxHp), 6);
}

function paintBoss(ctx, e, time, s) {
  const col = e.def.color;
  const id = e.def.id;
  ctx.fillStyle = shade(col, -0.55);
  ctx.beginPath();
  ctx.ellipse(0, 0, 34 * s, 30 * s, 0, 0, TAU);
  ctx.fill();

  if (id === 'ashlord') {
    ctx.fillStyle = shade(col, -0.3);
    ctx.beginPath();
    ctx.ellipse(2 * s, 0, 28 * s, 25 * s, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = time * 0.6 + (i / 5) * TAU;
      ctx.fillStyle = `rgba(255,140,60,${0.3 + Math.sin(time * 3 + i) * 0.15})`;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 16 * s, Math.sin(a) * 14 * s, 7 * s, 5 * s, a, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#2a1810';
    ctx.beginPath();
    ctx.moveTo(10 * s, -22 * s);
    ctx.lineTo(26 * s, -34 * s);
    ctx.lineTo(16 * s, -16 * s);
    ctx.closePath();
    ctx.moveTo(10 * s, 22 * s);
    ctx.lineTo(26 * s, 34 * s);
    ctx.lineTo(16 * s, 16 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffdca0';
    ctx.beginPath();
    ctx.arc(20 * s, -6 * s, 4 * s, 0, TAU);
    ctx.arc(20 * s, 6 * s, 4 * s, 0, TAU);
    ctx.fill();
  } else if (id === 'frostheart') {
    ctx.fillStyle = shade(col, -0.2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 26 * s, 24 * s, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = -time * 0.9 + (i / 6) * TAU;
      const rr = 40 * s + Math.sin(time * 2 + i) * 6 * s;
      ctx.fillStyle = 'rgba(190,240,255,0.55)';
      ctx.save();
      ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(10 * s, 0);
      ctx.lineTo(-6 * s, 5 * s);
      ctx.lineTo(-6 * s, -5 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(230,250,255,0.9)';
    ctx.beginPath();
    ctx.arc(6 * s, 0, 9 * s, 0, TAU);
    ctx.fill();
  } else {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 4 * s, 0, 0, 34 * s);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 34 * s, 26 * s, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0d0716';
    ctx.beginPath();
    ctx.ellipse(6 * s, 0, 12 * s, 16 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(8 * s, 0, 6 * s, 9 * s, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(176,107,255,${0.4 + Math.sin(time * 2) * 0.2})`;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.ellipse(0, 0, 46 * s, 38 * s, time * 0.5, 0, TAU);
    ctx.stroke();
  }
}

/* 색을 밝게(양수) 또는 어둡게(음수) 만든다. */
function shade(hex, amount) {
  const v = hex.replace('#', '');
  const n = v.length === 3
    ? parseInt(v[0] + v[0] + v[1] + v[1] + v[2] + v[2], 16)
    : parseInt(v, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    r = Math.round(r * (1 + amount));
    g = Math.round(g * (1 + amount));
    b = Math.round(b * (1 + amount));
  }
  return `rgb(${r},${g},${b})`;
}

/* ── 작은 지도 ──────────────────────────────────────────────────── */

export function drawMinimap(ctx, game, w, h) {
  const level = game.level;
  if (!level) return;
  ctx.clearRect(0, 0, w, h);
  const scale = Math.min(w / level.w, h / level.h);
  const ox = (w - level.w * scale) / 2;
  const oy = (h - level.h * scale) / 2;

  ctx.fillStyle = 'rgba(10,13,22,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(120,140,190,0.35)';
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      if (level.tiles[y * level.w + x] !== FLOOR) continue;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale + 0.6, scale + 0.6);
    }
  }

  const mark = (wx, wy, color, size) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ox + (wx / TILE) * scale, oy + (wy / TILE) * scale, size, 0, TAU);
    ctx.fill();
  };

  for (const c of level.chests) if (!c.opened) mark(c.x, c.y, '#e2c98a', 2.6);
  for (const s of level.shrines) if (!s.used) mark(s.x, s.y, '#a9e7ff', 2.4);
  for (const e of game.enemies) mark(e.x, e.y, e.tier === 'normal' ? '#e05a6a' : '#ffab4a', e.tier === 'boss' ? 5 : 3);
  if (game.portal) mark(game.portal.x, game.portal.y, '#9fe4ff', 4.4);
  mark(game.player.x, game.player.y, '#ffffff', 3.4);
}
