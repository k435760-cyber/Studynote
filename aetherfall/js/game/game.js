/* 게임 한 판의 모든 것. 스킬과 적은 여기 있는 함수들만 보고 동작한다. */

import {
  TAU, clamp, clamp01, damp, rand, randInt, chance, angleTo, angleDiff, dist, dist2, compact,
} from '../core/util.js';
import { fx, screen } from '../render/fx.js';
import { sfx, setMusicIntensity } from '../core/audio.js';
import { settings } from '../core/settings.js';
import { Level, TILE } from './dungeon.js';
import { Player, Enemy, Projectile, Zone, Pickup, isControlled, expForLevel } from './entities.js';
import { ENEMIES, bossFor, rollEnemy, rollElite, scaleFor, ELITE_SCALE } from './enemies.js';
import { makeItem, RARITIES } from './items.js';
import { CLASSES } from './classes.js';
import { heroProfile, luckOf } from './progress.js';

const DAMAGE_COLORS = {
  physical: '#ffe3c2',
  fire: '#ff9a4d',
  frost: '#9fe4ff',
  shock: '#cfe8ff',
  arcane: '#c9b0ff',
  holy: '#ffeaa8',
  poison: '#a8e57a',
  bleed: '#ff7f8f',
  burn: '#ff9a4d',
};

export class Game {
  constructor(opts) {
    this.cam = opts.camera;
    this.emit = opts.onEvent || (() => {});
    this.save = null;
    this.player = null;
    this.level = null;
    this.enemies = [];
    this.projectiles = [];
    this.zones = [];
    this.pickups = [];
    this.telegraphs = [];
    this.timers = [];
    this.state = 'idle';
    this.timeScale = 1;
    this.slowTimer = 0;
    this.flowTimer = 0;
    this.run = null;
    this.boss = null;
    this.portal = null;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.elapsed = 0;
  }

  /* ── 판 시작과 층 이동 ─────────────────────────────────────────── */

  startRun(save) {
    this.save = save;
    const profile = heroProfile(save);
    this.player = new Player(profile);
    this.luck = luckOf(save);
    this.run = {
      floor: 0, kills: 0, damage: 0, aether: 0, items: 0, time: 0, bosses: 0,
      startedAt: Date.now(), deepest: 0,
    };
    this.timers.length = 0;
    fx.reset();
    this.state = 'run';
    this.enterFloor(1);
    this.emit('runStart', {});
  }

  enterFloor(floor) {
    this.run.floor = floor;
    this.run.deepest = Math.max(this.run.deepest, floor);
    this.level = new Level(floor, (Date.now() ^ (floor * 2654435761)) >>> 0);
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.pickups.length = 0;
    this.telegraphs.length = 0;
    this.timers.length = 0;
    this.boss = null;
    this.portal = null;
    this.portalReady = false;
    fx.reset();

    const p = this.player;
    p.x = this.level.start.x;
    p.y = this.level.start.y;
    p.vx = 0; p.vy = 0;
    p.stopChannel();
    p.dash = null;
    p.setInvuln(1.2);
    this.cam.bounds = { x: 0, y: 0, w: this.level.width, h: this.level.height };
    this.cam.snapTo(p.x, p.y);

    const scale = scaleFor(floor);
    if (this.level.boss) {
      const def = bossFor(floor);
      const spawn = this.level.spawns[0];
      const e = new Enemy(def, spawn.x, spawn.y, {
        hp: scale.hp * (1 + floor * 0.06), damage: scale.damage, armor: scale.armor, xp: scale.xp,
      });
      this.enemies.push(e);
      this.boss = e;
      sfx('roar');
      fx.flash(def.color, 0.3, 0.6);
      this.emit('boss', { name: def.name, title: def.title });
    } else {
      for (const spawn of this.level.spawns) {
        const def = spawn.elite ? rollElite(floor) : rollEnemy(floor, this.level.rng);
        const mod = spawn.elite ? ELITE_SCALE : { hp: 1, damage: 1, armor: 1, xp: 1 };
        this.enemies.push(new Enemy(def, spawn.x, spawn.y, {
          hp: scale.hp * mod.hp, damage: scale.damage * mod.damage,
          armor: scale.armor * mod.armor, xp: scale.xp * mod.xp,
        }));
      }
    }

    this.emit('floor', { floor, boss: this.level.boss, enemies: this.enemies.length });
    sfx('portal');
    fx.ring(p.x, p.y, { r0: 20, r1: 320, color: '#9fc4ff', width: 14, life: 0.6 });
  }

  /* 층의 적을 모두 잡으면 출구가 열린다. */
  checkFloorClear() {
    if (this.portalReady || this.enemies.length > 0) return;
    this.portalReady = true;
    this.portal = { x: this.level.exit.x, y: this.level.exit.y, r: 56, age: 0 };
    sfx('portal');
    this.notify('출구가 열렸습니다');
    fx.ring(this.portal.x, this.portal.y, { r0: 20, r1: 300, color: '#9fe4ff', width: 14, life: 0.8 });
    this.emit('floorClear', { floor: this.run.floor });
  }

  nextFloor() {
    const next = this.run.floor + 1;
    this.emit('floorEnd', { floor: this.run.floor });
    fx.flash('#ffffff', 0.5, 0.35);
    this.enterFloor(next);
  }

  /* ── 매 프레임 ────────────────────────────────────────────────── */

  update(rawDt, control) {
    if (this.state !== 'run') return;

    if (this.slowTimer > 0) {
      this.slowTimer -= rawDt;
      if (this.slowTimer <= 0) this.timeScale = 1;
    }
    let dt = rawDt * this.timeScale;
    if (screen.hitstop > 0) {
      screen.hitstop -= rawDt;
      dt *= 0.08;
    }
    dt = Math.min(dt, 0.05);

    this.elapsed += dt;
    this.run.time += rawDt;

    for (const t of this.timers) {
      t.time -= dt;
      if (t.time <= 0 && !t.done) { t.done = true; t.fn(); }
    }
    compact(this.timers, (t) => !t.done);

    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = 0.18;
      this.level.buildFlow(this.player.x, this.player.y);
    }

    this.updatePlayer(dt, control);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);

    for (const z of this.zones) z.update(dt, this);
    compact(this.zones, (z) => !z.dead);

    for (const t of this.telegraphs) t.time -= dt;
    compact(this.telegraphs, (t) => t.time > 0);

    for (const pk of this.pickups) pk.update(dt, this);
    compact(this.pickups, (pk) => !pk.dead);

    if (this.comboTimer > 0) {
      this.comboTimer -= rawDt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }

    if (this.portal) {
      this.portal.age += dt;
      if (dist(this.portal.x, this.portal.y, this.player.x, this.player.y) < this.portal.r + this.player.r) {
        this.nextFloor();
        return;
      }
    }

    for (const c of this.level.chests) {
      if (c.opened) continue;
      if (dist(c.x, c.y, this.player.x, this.player.y) < c.r + this.player.r) this.openChest(c);
    }
    for (const s of this.level.shrines) {
      if (s.used) continue;
      if (dist(s.x, s.y, this.player.x, this.player.y) < s.r + this.player.r) this.useShrine(s);
    }

    fx.update(dt);
    this.cam.follow(this.player, rawDt);

    /* 가까이에 적이 많을수록 음악을 조인다. */
    let near = 0;
    for (const e of this.enemies) {
      if (dist2(e.x, e.y, this.player.x, this.player.y) < 900 * 900) near++;
    }
    setMusicIntensity(clamp(near / 6, 0, 1) * (this.boss ? 1 : 0.85));
  }

  updatePlayer(dt, control) {
    const p = this.player;
    if (p.dead) return;
    p.update(dt, this);

    const sp = p.speed;
    if (p.dash) {
      const speed = p.dash.speed * (0.45 + 0.55 * clamp01(p.dash.time / p.dash.duration));
      p.vx = Math.cos(p.dash.angle) * speed;
      p.vy = Math.sin(p.dash.angle) * speed;
      if (p.dash.trail && Math.random() < 0.7) fx.afterimage(p, { color: p.dash.trail });
      if (p.dash.onTouch) {
        for (const e of this.enemies) {
          if (dist(e.x, e.y, p.x, p.y) < e.r + p.r + 24) p.dash.onTouch(e);
        }
      }
    } else if (p.moveLock > 0 || isControlled(p)) {
      p.vx = damp(p.vx, 0, 0.06, dt);
      p.vy = damp(p.vy, 0, 0.06, dt);
    } else {
      p.vx = damp(p.vx, control.move.x * sp, 0.045, dt);
      p.vy = damp(p.vy, control.move.y * sp, 0.045, dt);
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    this.level.resolveCircle(p, p.r);
    p.moving = Math.hypot(p.vx, p.vy) / Math.max(1, p.baseSpeed);

    if (Math.hypot(control.move.x, control.move.y) > 0.1 && !control.aiming) {
      p.facing = damp(p.facing, p.facing + angleDiff(p.facing, Math.atan2(control.move.y, control.move.x)), 0.06, dt);
    }
    p.aimAngle = control.aim.angle;

    if (control.actions.attack) p.tryAttack(this, control.aim);
    if (control.actions.dodge) {
      const dir = Math.hypot(control.move.x, control.move.y) > 0.1 ? control.move : null;
      p.tryDodge(this, control.aim, dir);
    }
    for (let i = 0; i < 4; i++) {
      if (control.actions['skill' + i]) p.trySkill(this, i, control.aim);
    }
  }

  updateEnemies(dt) {
    const list = this.enemies;
    for (const e of list) {
      if (e.dead) continue;
      e.update(dt, this);

      if (e.status.taunt && e.status.taunt.by) {
        const t = e.status.taunt.by;
        const a = angleTo(e.x, e.y, t.x, t.y);
        e.vx = damp(e.vx, Math.cos(a) * e.speedNow, 0.2, dt);
        e.vy = damp(e.vy, Math.sin(a) * e.speedNow, 0.2, dt);
      }

      e.x += (e.vx + e.knock.x) * dt;
      e.y += (e.vy + e.knock.y) * dt;
      e.knock.x = damp(e.knock.x, 0, 0.06, dt);
      e.knock.y = damp(e.knock.y, 0, 0.06, dt);
      if (!e.def.flying) this.level.resolveCircle(e, e.r);
      else {
        /* 떠다니는 적도 바깥으로는 못 나간다. */
        e.x = clamp(e.x, e.r, this.level.width - e.r);
        e.y = clamp(e.y, e.r, this.level.height - e.r);
      }
    }

    /* 서로 겹치지 않게 밀어낸다. 적이 한 점에 뭉치면 그림이 망가진다. */
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr || d2 < 0.001) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        const aw = b.tier === 'boss' ? 1 : a.tier === 'boss' ? 0 : 0.5;
        a.x -= nx * push * (1 - aw) * 2 * 0.5;
        a.y -= ny * push * (1 - aw) * 2 * 0.5;
        b.x += nx * push * aw * 2 * 0.5;
        b.y += ny * push * aw * 2 * 0.5;
      }
    }

    compact(this.enemies, (e) => !e.dead);
    this.checkFloorClear();
  }

  updateProjectiles(dt) {
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.update(dt, this);
      if (pr.dead) continue;

      if (pr.sprite && Math.random() < 0.75) {
        fx.trail(pr.x, pr.y, { color: pr.color, size: pr.radius * 0.7, life: 0.16 });
      }
      if (this.level.solidAtWorld(pr.x, pr.y)) {
        pr.dead = true;
        fx.sparks(pr.x, pr.y, { count: 6, speed: 260, color: pr.color, life: 0.25 });
        pr.onExpire?.(pr);
        continue;
      }

      if (pr.hostile) {
        if (!p.dead && p.invuln <= 0 && dist(pr.x, pr.y, p.x, p.y) < pr.radius + p.r) {
          this.damagePlayer(pr.damage, { source: pr.source, angle: Math.atan2(pr.vy, pr.vx), knockback: 120, type: pr.type });
          fx.impact(pr.x, pr.y, Math.atan2(pr.vy, pr.vx), pr.color);
          pr.dead = true;
          pr.onExpire?.(pr);
        }
      } else {
        for (const e of this.enemies) {
          if (e.dead || pr.hitIds.has(e.id)) continue;
          if (dist(pr.x, pr.y, e.x, e.y) > pr.radius + e.r) continue;
          pr.hitIds.add(e.id);
          if (pr.aoe) {
            this.circle(pr.x, pr.y, pr.aoe, {
              damage: pr.damage, type: pr.type, source: pr.source, falloff: pr.aoeFalloff, knockback: 160,
            });
          } else {
            this.damage(e, pr.damage, { type: pr.type, source: pr.source, angle: Math.atan2(pr.vy, pr.vx), knockback: 130 });
          }
          pr.onHit?.(e, pr);
          fx.impact(pr.x, pr.y, Math.atan2(pr.vy, pr.vx) + Math.PI, pr.color);
          if (pr.pierce > 0) pr.pierce--;
          else { pr.dead = true; pr.onExpire?.(pr); }
          break;
        }
      }
      if (pr.life <= 0 && !pr.dead) {
        pr.dead = true;
        pr.onExpire?.(pr);
      }
    }
    compact(this.projectiles, (pr) => !pr.dead);
  }

  /* ── 세계 API: 스킬과 적이 쓰는 함수들 ─────────────────────────── */

  after(delay, fn) {
    this.timers.push({ time: delay, fn, done: false });
  }

  notify(text) {
    this.emit('notify', { text });
  }

  slowMotion(scale, duration) {
    this.timeScale = scale;
    this.slowTimer = duration;
  }

  telegraph(x, y, radius, time, color = '#ff8a3c') {
    this.telegraphs.push({ x, y, radius, time, max: time, color });
  }

  projectile(opts) {
    this.projectiles.push(new Projectile(opts));
  }

  zone(opts) {
    this.zones.push(new Zone(opts));
  }

  spawnEnemy(defId, x, y) {
    const def = ENEMIES[defId];
    if (!def) return null;
    const pos = this.level.nearestFloor(x, y);
    const scale = scaleFor(this.run.floor);
    const e = new Enemy(def, pos.x, pos.y, scale);
    this.enemies.push(e);
    fx.dots(pos.x, pos.y, { count: 12, speed: 300, color: def.color, life: 0.5, size: 8 });
    return e;
  }

  enemiesInRadius(x, y, r) {
    const out = [];
    const rr = r * r;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (dist2(x, y, e.x, e.y) <= (r + e.r) * (r + e.r)) out.push(e);
    }
    return out;
  }

  nearestEnemy(x, y, maxDist = 900, filter = null) {
    let best = null, bestD = maxDist * maxDist;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (filter && !filter(e)) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  cone(x, y, angle, arc, range, opts = {}) {
    const hits = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y);
      if (d > range + e.r) continue;
      const a = angleTo(x, y, e.x, e.y);
      if (Math.abs(angleDiff(angle, a)) > arc / 2 + Math.atan2(e.r, Math.max(40, d))) continue;
      hits.push(e);
    }
    for (const e of hits) {
      let dmg = opts.damage;
      if (opts.modify) dmg = opts.modify(e, dmg);
      this.damage(e, dmg, { ...opts, angle: opts.angle ?? angleTo(x, y, e.x, e.y) });
    }
    return hits;
  }

  circle(x, y, radius, opts = {}) {
    const hits = this.enemiesInRadius(x, y, radius);
    for (const e of hits) {
      let dmg = opts.damage;
      if (opts.falloff) {
        const d = clamp01(dist(x, y, e.x, e.y) / radius);
        dmg *= 1 - d * opts.falloff;
      }
      if (opts.modify) dmg = opts.modify(e, dmg);
      this.damage(e, dmg, { ...opts, angle: angleTo(x, y, e.x, e.y) });
    }
    return hits;
  }

  line(x, y, angle, length, width, opts = {}) {
    const hits = [];
    const dx = Math.cos(angle), dy = Math.sin(angle);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const rx = e.x - x, ry = e.y - y;
      const along = rx * dx + ry * dy;
      if (along < -e.r || along > length) continue;
      const perp = Math.abs(-rx * dy + ry * dx);
      if (perp > width / 2 + e.r) continue;
      hits.push(e);
    }
    for (const e of hits) this.damage(e, opts.damage, { ...opts, angle });
    return hits;
  }

  playerInCone(x, y, angle, arc, range) {
    const p = this.player;
    if (p.dead || p.invuln > 0) return false;
    const d = dist(x, y, p.x, p.y);
    if (d > range + p.r) return false;
    const a = angleTo(x, y, p.x, p.y);
    return Math.abs(angleDiff(angle, a)) <= arc / 2 + Math.atan2(p.r, Math.max(40, d));
  }

  playerInRadius(x, y, r) {
    const p = this.player;
    return !p.dead && dist(x, y, p.x, p.y) < r + p.r;
  }

  playerInLine(x, y, angle, length, width) {
    const p = this.player;
    if (p.dead) return false;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const rx = p.x - x, ry = p.y - y;
    const along = rx * dx + ry * dy;
    if (along < 0 || along > length) return false;
    return Math.abs(-rx * dy + ry * dx) <= width / 2 + p.r;
  }

  flowAt(x, y) {
    return this.level.flowAt(x, y);
  }

  placeInside(entity, x, y) {
    const pos = this.level.nearestFloor(
      clamp(x, TILE, this.level.width - TILE),
      clamp(y, TILE, this.level.height - TILE),
    );
    entity.x = pos.x;
    entity.y = pos.y;
    entity.vx = 0; entity.vy = 0;
  }

  blink(actor, x, y) {
    this.placeInside(actor, x, y);
  }

  dash(actor, angle, distance, duration, opts = {}) {
    actor.dash = { angle, speed: distance / duration, time: duration, duration, ...opts };
    if (opts.invuln) actor.setInvuln?.(duration + 0.06);
  }

  knockback(target, angle, force) {
    if (!target || target.tier === 'boss') return;
    target.knock.x += Math.cos(angle) * force;
    target.knock.y += Math.sin(angle) * force;
  }

  status(target, key, duration, data = {}) {
    if (!target || target.dead) return;
    if (target.tier === 'boss' && (key === 'stun' || key === 'freeze')) {
      duration *= 0.25;   /* 보스는 오래 묶이지 않는다 */
    }
    const cur = target.status[key];
    target.status[key] = { ...data, time: Math.max(duration, cur ? cur.time : 0), acc: cur?.acc || 0 };
    if (key === 'stun' || key === 'freeze') target.stagger = Math.max(target.stagger || 0, 0.1);
  }

  chillPlayer(duration) {
    this.status(this.player, 'chill', duration, { mul: 0.62 });
  }

  /* 적에게 주는 피해 */
  damage(enemy, amount, opts = {}) {
    if (!enemy || enemy.dead) return 0;
    const src = opts.source;
    const isPlayer = src === this.player;

    let crit = opts.crit === true;
    if (isPlayer && opts.crit === undefined && !opts.dot) {
      crit = Math.random() < this.player.critChance || !!this.player.buffs.ambush?.guaranteedCrit;
    }
    if (isPlayer && this.player.buffs.ambush?.guaranteedCrit) {
      crit = true;
      delete this.player.buffs.ambush;
    }

    let dmg = amount;
    if (crit) dmg *= isPlayer ? this.player.critMul : 1.6;
    const armor = Math.max(0, enemy.armor);
    dmg *= 340 / (340 + armor);
    if (enemy.status.shock) dmg *= 1 + (enemy.status.shock.vulnerable || 0.16);
    if (enemy.status.freeze) dmg *= 1.2;
    dmg = Math.max(1, dmg);

    enemy.hp -= dmg;
    enemy.hitFlash = 1;
    if (!opts.dot) enemy.stagger = Math.max(enemy.stagger, 0.06);

    if (isPlayer) {
      this.run.damage += dmg;
      this.player.combatTimer = 5;
      if (this.player.lifesteal > 0 && !opts.dot) {
        this.healPlayer(dmg * this.player.lifesteal, { silent: true });
      }
      this.registerResonance(enemy, opts.type);
      if (!opts.silent) {
        this.comboCount++;
        this.comboTimer = 2.2;
        this.emit('combo', { count: this.comboCount });
      }
    }

    if (!opts.silent) {
      const color = crit ? '#fff1b8' : (DAMAGE_COLORS[opts.type] || '#ffffff');
      fx.text(enemy.x + rand(-16, 16), enemy.y - enemy.r - 12, Math.round(dmg).toString(), {
        color, size: crit ? 46 : 32, crit, kind: 'damage',
        vy: crit ? -220 : -150, weight: crit ? 900 : 800,
      });
      const ang = opts.angle ?? rand(0, TAU);
      fx.impact(enemy.x, enemy.y, ang, DAMAGE_COLORS[opts.type] || '#ffd9a0', crit ? 1.5 : 1);
      if (crit) {
        sfx('hitCrit');
        fx.hitstop(0.05);
        this.cam.shake(0.22);
      } else if (!opts.dot) {
        sfx('hit');
      }
      if (opts.type === 'physical' && !opts.dot) fx.bloodBurst(enemy.x, enemy.y, ang, '#6b2036');
    }

    if (opts.knockback) this.knockback(enemy, opts.angle ?? 0, opts.knockback);
    if (enemy.hp <= 0) this.killEnemy(enemy, opts);
    return dmg;
  }

  /* 비전술사의 공명. 다른 원소를 짧은 간격으로 겹치면 한 번 더 터진다. */
  registerResonance(enemy, type) {
    if (this.player.classId !== 'arcanist') return;
    if (!['fire', 'frost', 'shock', 'arcane'].includes(type)) return;
    const now = this.elapsed;
    const last = enemy.elements.last;
    if (last && last.type !== type && now - last.time < 3) {
      enemy.elements.last = null;
      const dmg = this.player.dmg(0.9, 'arcane');
      fx.ring(enemy.x, enemy.y, { r0: 20, r1: 220, color: '#e0c4ff', width: 12, life: 0.4 });
      fx.dots(enemy.x, enemy.y, { count: 16, speed: 420, color: '#e0c4ff', life: 0.5, size: 8 });
      fx.text(enemy.x, enemy.y - enemy.r - 54, '공명', { color: '#e0c4ff', size: 30, life: 0.7 });
      sfx('shock');
      for (const e of this.enemiesInRadius(enemy.x, enemy.y, 220)) {
        this.damage(e, dmg, { type: 'arcane', source: this.player, silent: e !== enemy, dot: true });
      }
      return;
    }
    enemy.elements.last = { type, time: now };
  }

  killEnemy(enemy, opts = {}) {
    if (enemy.dead) return;
    enemy.dead = true;
    this.run.kills++;
    this.player.gainExp(enemy.xp, this);

    const isBoss = enemy.tier === 'boss';
    const isElite = enemy.tier === 'elite';
    sfx(isBoss ? 'dieBig' : 'die');
    fx.explosion(enemy.x, enemy.y, enemy.r * (isBoss ? 4.2 : 1.9), enemy.def.color, { smoke: !isBoss });
    fx.bloodBurst(enemy.x, enemy.y, opts.angle ?? rand(0, TAU));
    this.cam.shake(isBoss ? 1 : isElite ? 0.45 : 0.2);

    if (isBoss) {
      this.run.bosses++;
      fx.flash('#ffffff', 0.5, 0.6);
      this.slowMotion(0.25, 0.9);
      fx.hitstop(0.2);
      this.emit('bossDown', { name: enemy.name });
      this.boss = null;
    }

    /* 전리품. 층이 깊을수록, 등급이 높을수록 많이 떨어진다. */
    const soulCount = isBoss ? 14 : isElite ? 6 : 2;
    for (let i = 0; i < soulCount; i++) {
      this.pickups.push(new Pickup(enemy.x, enemy.y, 'soul', Math.max(1, Math.round(enemy.xp / soulCount))));
    }
    const aetherRoll = isBoss ? 26 + this.run.floor * 2 : isElite ? 6 : (chance(0.35) ? randInt(1, 3) : 0);
    if (aetherRoll > 0) this.pickups.push(new Pickup(enemy.x, enemy.y, 'aether', aetherRoll));
    if (chance(isBoss ? 1 : isElite ? 0.55 : 0.09)) {
      const item = makeItem(this.run.floor, {
        luck: this.luck + (isBoss ? 0.6 : isElite ? 0.25 : 0),
        classId: this.player.classId,
      });
      this.pickups.push(new Pickup(enemy.x, enemy.y, 'item', 0, item));
    }
    if (chance(isBoss ? 1 : 0.08)) {
      this.pickups.push(new Pickup(enemy.x, enemy.y, 'heal', Math.round(this.player.maxHp * (isBoss ? 0.4 : 0.14))));
    }
  }

  /* 플레이어가 받는 피해 */
  damagePlayer(amount, opts = {}) {
    const p = this.player;
    if (p.dead || (p.invuln > 0 && !opts.silent)) return 0;

    let dmg = amount * p.damageTakenMul;
    dmg *= 340 / (340 + p.armor);
    dmg = Math.max(1, dmg);

    if (p.shield > 0) {
      const used = Math.min(p.shield, dmg);
      p.shield -= used;
      dmg -= used;
      fx.ring(p.x, p.y, { r0: p.r, r1: p.r + 40, color: '#9fc4ff', width: 6, life: 0.25 });
      if (p.shield <= 0) sfx('block');
    }

    if (dmg > 0) {
      p.hp -= dmg;
      p.hitFlash = 1;
      p.combatTimer = 5;
      const res = p.cls.resource;
      if (res.onHitTaken) p.gainResource(res.onHitTaken * (amount / p.maxHp) * 4);
      if (!opts.silent) {
        sfx('hurt');
        this.cam.shake(clamp(0.25 + dmg / p.maxHp * 1.6, 0.2, 0.9));
        fx.flash('#c8202a', clamp(0.1 + (dmg / p.maxHp) * 0.7, 0.1, 0.3), 0.2);
        fx.bloodBurst(p.x, p.y, (opts.angle ?? 0) + Math.PI);
        fx.text(p.x, p.y - p.r - 20, `-${Math.round(dmg)}`, { color: '#ff8f8f', size: 30, life: 0.7, kind: 'damage' });
        if (settings.vibration && navigator.vibrate) navigator.vibrate(18);
      }
      if (opts.knockback) {
        const a = opts.angle ?? 0;
        p.vx += Math.cos(a) * opts.knockback;
        p.vy += Math.sin(a) * opts.knockback;
      }
      /* 불멸의 성벽: 받은 피해를 그대로 돌려준다. */
      const reflect = p.buffs.aegis?.reflect;
      if (reflect && opts.source && opts.source.kind === 'enemy') {
        this.damage(opts.source, dmg * reflect, { type: 'holy', source: p, silent: true });
      }
    }

    if (p.hp <= 0) {
      if (p.buffs.covenant?.cheatDeath) {
        delete p.buffs.covenant.cheatDeath;
        p.hp = p.maxHp * 0.45;
        sfx('levelUp');
        fx.flash('#fff4cf', 0.5, 0.6);
        fx.ring(p.x, p.y, { r0: 20, r1: 420, color: '#ffe9a8', width: 18, life: 0.7 });
        this.notify('서약이 당신을 붙잡았습니다');
      } else {
        this.killPlayer();
      }
    }
    return dmg;
  }

  healPlayer(amount, opts = {}) {
    const p = this.player;
    if (p.dead) return;
    let heal = amount;
    if (p.classId === 'oracle') {
      const missing = 1 - p.hp / p.maxHp;
      heal *= 1 + missing * 1.2;
      p.gainResource(p.cls.resource.onHeal || 0);
    }
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    const applied = p.hp - before;
    const over = heal - applied;
    if (over > 0 && p.classId === 'oracle') p.addShield(over * 0.5);
    if (!opts.silent && applied > 1) {
      fx.text(p.x + rand(-14, 14), p.y - p.r - 30, `+${Math.round(applied)}`, {
        color: '#8fe3a5', size: 28, life: 0.8, vy: -130,
      });
    }
  }

  killPlayer() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.hp = 0;
    this.state = 'dead';
    sfx('dieBig');
    this.slowMotion(0.25, 1.4);
    fx.flash('#3a0a10', 0.55, 0.9);
    fx.explosion(p.x, p.y, 200, '#c84a4a');
    this.cam.shake(1);
    this.emit('death', { run: this.run });
  }

  onLevelUp(levels) {
    const p = this.player;
    sfx('levelUp');
    fx.ring(p.x, p.y, { r0: 20, r1: 340, color: '#ffe9a8', width: 16, life: 0.7 });
    fx.dots(p.x, p.y, { count: 36, speed: 260, color: '#fff4cf', life: 1.2, size: 9, rise: 200 });
    fx.light(p.x, p.y, 700, 'rgba(255,240,200,0.6)', { life: 0.7, intensity: 1.2 });
    fx.flash('#ffe9a8', 0.22, 0.4);
    fx.text(p.x, p.y - p.r - 60, `레벨 ${p.level}`, { color: '#ffe9a8', size: 44, life: 1.3, vy: -90, crit: true });
    this.cam.shake(0.3);
    this.emit('levelUp', { level: p.level, levels });
  }

  collect(pickup) {
    const p = this.player;
    if (pickup.kind === 'soul') {
      p.gainExp(pickup.value, this);
      fx.dots(p.x, p.y, { count: 3, speed: 90, color: '#9fd6ff', life: 0.3, size: 5 });
    } else if (pickup.kind === 'aether') {
      this.run.aether += pickup.value;
      sfx('loot');
      fx.text(p.x, p.y - 60, `에테르 +${pickup.value}`, { color: '#a9e7ff', size: 26, life: 0.9 });
    } else if (pickup.kind === 'heal') {
      this.healPlayer(pickup.value);
      sfx('heal');
    } else if (pickup.kind === 'item') {
      this.run.items++;
      sfx('loot');
      this.emit('item', { item: pickup.item });
      const r = RARITIES[pickup.item.rarity];
      fx.text(p.x, p.y - 70, pickup.item.name, { color: r.color, size: 28, life: 1.4, vy: -70 });
      fx.dots(p.x, p.y, { count: 14, speed: 200, color: r.color, life: 0.7, size: 8 });
    }
  }

  openChest(chest) {
    chest.opened = true;
    sfx('chest');
    fx.explosion(chest.x, chest.y, 140, '#e2c98a', { shards: false });
    fx.light(chest.x, chest.y, 460, 'rgba(226,201,138,0.6)', { life: 0.6 });
    const count = 1 + (chance(0.4) ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const item = makeItem(this.run.floor + 2, { luck: this.luck + 0.35, classId: this.player.classId });
      this.pickups.push(new Pickup(chest.x + rand(-40, 40), chest.y + rand(-40, 40), 'item', 0, item));
    }
    this.pickups.push(new Pickup(chest.x, chest.y, 'aether', randInt(6, 14) + this.run.floor));
    this.notify('상자를 열었습니다');
  }

  useShrine(shrine) {
    shrine.used = true;
    sfx('holy');
    const p = this.player;
    const roll = Math.random();
    fx.ring(shrine.x, shrine.y, { r0: 20, r1: 240, color: '#a9e7ff', width: 12, life: 0.6 });
    fx.dots(shrine.x, shrine.y, { count: 24, speed: 160, color: '#a9e7ff', life: 1, size: 8, rise: 140 });
    if (roll < 0.4) {
      this.healPlayer(p.maxHp * 0.35);
      this.notify('제단이 상처를 씻어 냈습니다');
    } else if (roll < 0.7) {
      p.addBuff('shrinePower', 60, { });
      p.equipment.totals = { ...p.equipment.totals, damage: (p.equipment.totals.damage || 0) + 0.12 };
      p.recompute();
      this.notify('제단의 힘 · 이번 판 동안 피해 +12%');
    } else {
      p.addShield(p.maxHp * 0.3);
      this.notify('제단이 보호막을 둘렀습니다');
    }
  }

  /* 판이 끝났을 때 남길 결과 */
  summary() {
    return {
      classId: this.player.classId,
      className: CLASSES[this.player.classId].name,
      floor: this.run.deepest,
      level: this.player.level,
      kills: this.run.kills,
      damage: Math.round(this.run.damage),
      aether: this.run.aether,
      items: this.run.items,
      bosses: this.run.bosses,
      duration: Math.round(this.run.time),
    };
  }
}

export { expForLevel };
