/* 플레이어와 적, 투사체 같은 실제 움직이는 것들.
   피해 계산과 죽음 처리는 game.js 가 맡고, 여기서는 자기 상태만 관리한다. */

import { TAU, clamp, clamp01, damp, rand, angleTo, angleDiff, nextId, dist, josa } from '../core/util.js';
import { CLASSES, baseStatsFor } from './classes.js';
import { SKILLS, cooldownOf, MAX_RANK } from './skills.js';
import { fx } from '../render/fx.js';
import { sfx } from '../core/audio.js';

export const DMG_UNIT = (level) => 16 + level * 2.4;

/* 지속 피해와 행동 불가를 한 곳에서 처리한다. */
export function updateStatuses(actor, dt, g) {
  const st = actor.status;
  for (const key of Object.keys(st)) {
    const s = st[key];
    s.time -= dt;
    if (s.dps) {
      s.acc = (s.acc || 0) + dt;
      if (s.acc >= 0.5) {
        const amount = s.dps * s.acc * (s.stacks || 1);
        s.acc = 0;
        if (actor.kind === 'player') g.damagePlayer(amount, { type: key, silent: true });
        else g.damage(actor, amount, { type: key, source: s.source || null, silent: true, dot: true });
      }
    }
    if (s.time <= 0) delete st[key];
  }
}

export function speedMultiplier(actor) {
  let m = 1;
  const st = actor.status;
  if (st.slow) m *= st.slow.mul ?? 0.6;
  if (st.chill) m *= st.chill.mul ?? 0.6;
  if (st.stun || st.freeze) m = 0;
  return m;
}

export const isControlled = (a) => !!(a.status.stun || a.status.freeze);

/* ── 플레이어 ─────────────────────────────────────────────────────── */

export class Player {
  constructor(profile) {
    this.id = nextId();
    this.kind = 'player';
    this.classId = profile.classId;
    this.cls = CLASSES[this.classId];
    this.colors = this.cls.colors;
    this.level = profile.level || 1;
    this.exp = profile.exp || 0;
    this.attributes = { ...profile.attributes };
    this.skillRanks = { ...profile.skillRanks };
    this.equipment = profile.equipment || {};
    this.awakening = profile.awakening || {};

    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.r = 26;
    this.facing = 0;
    this.aimAngle = 0;
    this.moving = 0;
    this.animTime = 0;
    this.swing = 0;          // 0~1, 무기를 휘두르는 진행도
    this.swingDir = 1;
    this.hitFlash = 0;
    this.dead = false;

    this.status = {};
    this.buffs = {};
    this.shield = 0;
    this.invuln = 0;
    this.moveLock = 0;
    this.dash = null;
    this.channel = null;
    this.marks = 0;
    this.lastElement = null;
    this.lastElementTime = 0;

    this.attackCd = 0;
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.dodgeCd = 0;
    this.cooldowns = {};
    this.combatTimer = 0;

    this.recompute();
    this.hp = this.maxHp;
    /* 수호력과 분노는 절반에서 시작한다. 첫 교전부터 스킬을 한 번은 쓸 수 있어야 한다. */
    const res = this.cls.resource;
    this.resource = res.regen < 0 ? this.resourceMax * 0.5 : this.resourceMax;
  }

  recompute() {
    const base = baseStatsFor(this.classId, this.level);
    const a = this.attributes;
    const eq = this.equipment.totals || {};
    const aw = this.awakening.totals || {};

    const power = base.power + (a.power || 0) * 2 + (eq.power || 0);
    const agility = base.agility + (a.agility || 0) * 2 + (eq.agility || 0);
    const intellect = base.intellect + (a.intellect || 0) * 2 + (eq.intellect || 0);
    const vitality = base.vitality + (a.vitality || 0) * 2 + (eq.vitality || 0);

    this.stats = { power, agility, intellect, vitality };
    const prevMax = this.maxHp || 0;
    this.maxHp = Math.round((base.hp + vitality * 13 + (eq.hp || 0)) * (1 + (aw.hp || 0)));
    if (prevMax && this.maxHp > prevMax) this.hp += this.maxHp - prevMax;

    this.armor = base.armor + (eq.armor || 0) + (aw.armor || 0);
    this.critChance = clamp(base.crit + agility * 0.0034 + (eq.crit || 0), 0, 0.8);
    this.critMul = 1.65 + power * 0.0016 + (eq.critDmg || 0);
    const dmgBonus = 1 + (eq.damage || 0) + (aw.damage || 0);
    this.physMul = (1 + power * 0.017) * dmgBonus;
    this.spellMul = (1 + intellect * 0.017) * dmgBonus;
    this.baseSpeed = base.speed * (1 + agility * 0.0015) * (1 + (eq.speed || 0) + (aw.speed || 0));
    this.cdr = clamp((eq.cdr || 0) + (aw.cdr || 0), 0, 0.45);
    this.lifesteal = (eq.lifesteal || 0) + (aw.lifesteal || 0);
    this.resourceMax = this.cls.resource.max * (1 + (aw.resource || 0));
    this.resource = Math.min(this.resource ?? 0, this.resourceMax);
  }

  get speed() {
    let s = this.baseSpeed * speedMultiplier(this);
    for (const b of Object.values(this.buffs)) if (b.speed) s *= b.speed;
    if (this.channel) s *= this.channel.moveMul ?? 1;
    return s;
  }

  get haste() {
    let h = 1;
    for (const b of Object.values(this.buffs)) if (b.haste) h *= b.haste;
    if (this.classId === 'berserker' && this.resource >= 80) h *= 1.2;
    return h;
  }

  get damageTakenMul() {
    let m = 1;
    for (const b of Object.values(this.buffs)) if (b.damageTaken) m *= b.damageTaken;
    if (this.classId === 'guardian' && this.resource >= 60) m *= 0.82;
    return m;
  }

  get stealthed() { return !!this.buffs.veil; }

  rank(skillId) {
    return this.skillRanks[skillId] || 1;
  }

  /* 스킬 계수를 실제 피해 숫자로 바꾼다. */
  dmg(coef, type = 'physical') {
    const mul = type === 'physical' ? this.physMul : this.spellMul;
    let d = coef * mul * DMG_UNIT(this.level);
    if (this.classId === 'berserker') {
      const missing = 1 - this.hp / this.maxHp;
      d *= 1 + missing * 0.5;
    }
    if (this.classId === 'shade' && this.marks > 0) d *= 1 + this.marks * 0.08;
    return d;
  }

  gainResource(v) {
    this.resource = clamp(this.resource + v, 0, this.resourceMax);
  }

  canPay(cost) {
    return this.resource >= cost;
  }

  pay(cost) {
    if (this.resource < cost) return false;
    this.resource -= cost;
    return true;
  }

  addShield(v) {
    this.shield = Math.max(this.shield, 0) + v;
  }

  addBuff(id, duration, data = {}) {
    const cur = this.buffs[id];
    this.buffs[id] = { ...data, time: Math.max(duration, cur ? cur.time : 0), max: duration };
  }

  hasBuff(id) { return !!this.buffs[id]; }

  setInvuln(t) { this.invuln = Math.max(this.invuln, t); }

  lockMove(t) { this.moveLock = Math.max(this.moveLock, t); }

  startChannel(opts) {
    this.channel = { ...opts, time: opts.duration, acc: 0 };
  }

  stopChannel() {
    if (this.channel) {
      this.channel.onEnd?.();
      this.channel = null;
    }
  }

  cooldownLeft(skillId) {
    return Math.max(0, this.cooldowns[skillId] || 0);
  }

  cooldownRatio(skillId) {
    const skill = SKILLS[skillId];
    if (!skill) return 0;
    const full = cooldownOf(skill, this.cdr);
    return clamp01(this.cooldownLeft(skillId) / full);
  }

  update(dt, g) {
    this.animTime += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.invuln = Math.max(0, this.invuln - dt);
    this.moveLock = Math.max(0, this.moveLock - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.combatTimer = Math.max(0, this.combatTimer - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.comboIndex = 0;
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt * 6.5);

    for (const id of Object.keys(this.cooldowns)) {
      this.cooldowns[id] -= dt;
      if (this.cooldowns[id] <= 0) delete this.cooldowns[id];
    }

    for (const id of Object.keys(this.buffs)) {
      const b = this.buffs[id];
      b.time -= dt;
      if (b.regen) g.healPlayer(b.regen * dt, { silent: true });
      if (b.time <= 0) delete this.buffs[id];
    }

    updateStatuses(this, dt, g);

    /* 자원 자연 회복. 수호력·분노는 싸우지 않으면 식는다. */
    const res = this.cls.resource;
    if (res.regen > 0) this.gainResource(res.regen * dt);
    else if (res.regen < 0 && this.combatTimer <= 0) this.gainResource(res.regen * dt);

    if (this.classId === 'shade' && this.combatTimer <= 0 && this.marks > 0) {
      this.markDecay = (this.markDecay || 0) + dt;
      if (this.markDecay > 2) { this.marks = Math.max(0, this.marks - 1); this.markDecay = 0; }
    }

    if (this.channel) {
      this.channel.time -= dt;
      this.channel.acc += dt;
      while (this.channel.acc >= this.channel.tick) {
        this.channel.acc -= this.channel.tick;
        this.channel.onTick?.();
      }
      if (this.channel.time <= 0 || isControlled(this)) this.stopChannel();
    }

    if (this.dash) {
      this.dash.time -= dt;
      const t = 1 - clamp01(this.dash.time / this.dash.duration);
      const step = this.dash.speed * (1 - t * 0.55) * dt;
      this.dashStep = step;
      if (this.dash.time <= 0) this.dash = null;
    }
  }

  /* 기본 공격. 성공하면 true. */
  tryAttack(g, aim) {
    if (this.attackCd > 0 || isControlled(this) || this.channel) return false;
    const atk = this.cls.attack;
    this.facing = aim.angle;
    this.aimAngle = aim.angle;
    this.attackCd = atk.cooldown / this.haste;
    this.combatTimer = 4;
    this.swing = 1;
    this.swingDir *= -1;

    const stealthBonus = this.stealthed ? 2.5 : 1;
    if (this.stealthed) delete this.buffs.veil;

    if (atk.kind === 'melee') {
      const coefs = atk.combo;
      const idx = this.comboIndex % coefs.length;
      this.comboIndex++;
      this.comboTimer = 0.8;
      const coef = coefs[idx] * (idx === coefs.length - 1 ? 1 : 1);
      const range = atk.range;
      sfx(idx === coefs.length - 1 ? 'swingHeavy' : 'swing');
      const hits = g.cone(this.x, this.y, aim.angle, atk.arc, range, {
        damage: this.dmg(coef, atk.damageType) * stealthBonus,
        type: atk.damageType, source: this, angle: aim.angle,
        knockback: atk.knockback * (idx === coefs.length - 1 ? 1.6 : 1),
      });
      const arcColor = this.colors.glow;
      fx.arc(this.x, this.y, {
        angle: aim.angle, spread: atk.arc, radius: range * 0.92, color: arcColor,
        width: 18 + idx * 6, life: 0.18, swing: 0.45 * this.swingDir,
      });
      if (hits.length) {
        this.gainResource(this.cls.resource.onHitDealt || 0);
        if (atk.comboPoint) this.marks = Math.min(5, this.marks + 1);
        fx.hitstop(idx === coefs.length - 1 ? 0.045 : 0.02);
        g.cam.shake(0.1 + idx * 0.05);
      }
    } else {
      sfx('cast');
      g.projectile({
        x: this.x + Math.cos(aim.angle) * 34, y: this.y + Math.sin(aim.angle) * 34,
        angle: aim.angle, speed: atk.speed, radius: atk.radius, life: atk.life,
        damage: this.dmg(atk.coef, atk.damageType) * stealthBonus,
        type: atk.damageType, source: this, color: atk.color,
        pierce: atk.pierce || 0, homing: atk.homing || 0, sprite: this.classId,
        onHit: () => {
          this.gainResource(this.cls.resource.onHitDealt || 0);
        },
      });
      fx.sparks(this.x + Math.cos(aim.angle) * 40, this.y + Math.sin(aim.angle) * 40, {
        count: 5, angle: aim.angle, spread: 0.7, speed: 300, color: atk.color, life: 0.2, size: 3,
      });
    }
    return true;
  }

  trySkill(g, slot, aim) {
    const ids = [...this.cls.skills, this.cls.ult];
    const id = ids[slot];
    const skill = SKILLS[id];
    if (!skill) return false;
    if (this.cooldownLeft(id) > 0 || isControlled(this) || this.channel) return false;
    if (!this.canPay(skill.cost)) {
      sfx('error');
      const name = this.cls.resource.name;
      g.notify(`${name}${josa(name, '이/가')} 모자랍니다`);
      return false;
    }
    this.pay(skill.cost);
    this.cooldowns[id] = cooldownOf(skill, this.cdr);
    this.combatTimer = 5;
    if (skill.aim !== 'self') this.facing = aim.angle;

    /* 그림자 자객의 표식은 스킬을 쓸 때 소모된다. */
    const usedMarks = this.marks;
    skill.exec(g, this, aim, this.rank(id));
    if (this.classId === 'shade' && usedMarks > 0) {
      this.marks = 0;
      fx.dots(this.x, this.y, { count: usedMarks * 3, speed: 260, color: '#9bffe4', life: 0.4, size: 7 });
    }
    return true;
  }

  tryDodge(g, aim, moveDir) {
    if (this.dodgeCd > 0 || isControlled(this)) return false;
    const angle = moveDir ? Math.atan2(moveDir.y, moveDir.x) : aim.angle;
    this.dodgeCd = 1.15 * (1 - this.cdr * 0.5);
    this.setInvuln(0.26);
    this.stopChannel();
    g.dash(this, angle, 320, 0.18, { invuln: true, trail: this.colors.glow });
    sfx('dash');
    fx.ring(this.x, this.y, { r0: 10, r1: 90, color: this.colors.glow, width: 5, life: 0.22 });
    return true;
  }

  gainExp(amount, g) {
    this.exp += amount;
    let leveled = 0;
    while (this.level < 60 && this.exp >= expForLevel(this.level)) {
      this.exp -= expForLevel(this.level);
      this.level++;
      leveled++;
    }
    if (leveled) {
      this.recompute();
      this.hp = this.maxHp;
      g.onLevelUp(leveled);
    }
  }
}

export function expForLevel(level) {
  return Math.round(62 * Math.pow(level, 1.42) + 44 * level);
}

/* ── 적 ───────────────────────────────────────────────────────────── */

export class Enemy {
  constructor(def, x, y, scale) {
    this.id = nextId();
    this.kind = 'enemy';
    this.def = def;
    this.name = def.name;
    this.tier = def.tier || 'normal';
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = def.r;
    this.facing = rand(0, TAU);
    this.maxHp = Math.round(def.hp * scale.hp);
    this.hp = this.maxHp;
    this.armor = def.armor * scale.armor;
    this.damage = def.damage * scale.damage;
    this.xp = Math.round(def.xp * scale.xp);
    this.speed = def.speed;
    this.state = 'idle';
    this.stateTime = 0;
    this.attackCd = rand(0.2, 1.2);
    this.status = {};
    this.hitFlash = 0;
    this.dead = false;
    this.target = null;
    this.loseTarget = 0;
    this.animTime = rand(0, 10);
    this.aggroRange = def.aggro || 700;
    this.knock = { x: 0, y: 0 };
    this.telegraph = null;
    this.elements = {};      // 비전술사 공명 판정용
    this.stagger = 0;
    this.wander = rand(0, TAU);
  }

  get speedNow() {
    return this.speed * speedMultiplier(this) * (this.status.taunt ? 1.1 : 1);
  }

  update(dt, g) {
    this.animTime += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.stateTime += dt;
    this.loseTarget = Math.max(0, this.loseTarget - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    updateStatuses(this, dt, g);

    if (this.telegraph) {
      this.telegraph.time -= dt;
      if (this.telegraph.time <= 0) this.telegraph = null;
    }

    const p = g.player;
    const canSee = !p.stealthed && this.loseTarget <= 0 && !p.dead;
    const d = dist(this.x, this.y, p.x, p.y);

    if (isControlled(this) || this.stagger > 0) {
      this.vx = damp(this.vx, 0, 0.05, dt);
      this.vy = damp(this.vy, 0, 0.05, dt);
      return;
    }

    if (this.def.think) {
      this.def.think(this, g, dt, { player: p, distance: d, canSee });
      return;
    }

    defaultThink(this, g, dt, p, d, canSee);
  }

  setState(name) {
    this.state = name;
    this.stateTime = 0;
  }
}

/* 기본 행동: 다가가서 준비 동작을 보이고 때린다.
   원거리 적은 적당한 거리를 유지하려고 좌우로 돈다. */
export function defaultThink(e, g, dt, p, d, canSee) {
  const atk = e.def.attack;
  const engage = atk.range * 0.8;

  if (e.state === 'windup') {
    e.vx = damp(e.vx, 0, 0.06, dt);
    e.vy = damp(e.vy, 0, 0.06, dt);
    e.facing = angleLerpSafe(e.facing, angleTo(e.x, e.y, p.x, p.y), dt * 3);
    if (e.stateTime >= atk.windup) {
      performAttack(e, g, p);
      e.setState('recover');
    }
    return;
  }

  if (e.state === 'recover') {
    e.vx = damp(e.vx, 0, 0.09, dt);
    e.vy = damp(e.vy, 0, 0.09, dt);
    if (e.stateTime >= atk.recover) e.setState('chase');
    return;
  }

  if (e.state === 'charge') {
    const step = e.def.attack.chargeSpeed * dt;
    e.vx = Math.cos(e.facing) * e.def.attack.chargeSpeed;
    e.vy = Math.sin(e.facing) * e.def.attack.chargeSpeed;
    if (d < p.r + e.r + 16) {
      g.damagePlayer(e.damage * 1.5, { source: e, angle: e.facing, knockback: 320 });
      e.setState('recover');
    }
    if (e.stateTime > atk.chargeTime) e.setState('recover');
    return;
  }

  if (!canSee || d > e.aggroRange) {
    /* 놓쳤으면 제자리에서 어슬렁거린다. */
    e.wander += rand(-1, 1) * dt;
    const sp = e.speedNow * 0.25;
    e.vx = damp(e.vx, Math.cos(e.wander) * sp, 0.4, dt);
    e.vy = damp(e.vy, Math.sin(e.wander) * sp, 0.4, dt);
    if (Math.hypot(e.vx, e.vy) > 4) e.facing = Math.atan2(e.vy, e.vx);
    return;
  }

  const flow = g.flowAt(e.x, e.y);
  let dirX, dirY;
  if (d > 340 && flow) { dirX = flow.x; dirY = flow.y; }
  else { const a = angleTo(e.x, e.y, p.x, p.y); dirX = Math.cos(a); dirY = Math.sin(a); }

  if (atk.type === 'ranged') {
    const want = clamp(atk.range * 0.7, 180, 620);
    const diff = d - want;
    const strafe = Math.sin(e.animTime * 0.8 + e.id) * 0.9;
    const a = Math.atan2(dirY, dirX);
    const sx = Math.cos(a + Math.PI / 2) * strafe;
    const sy = Math.sin(a + Math.PI / 2) * strafe;
    const approach = clamp(diff / 160, -1, 1);
    const sp = e.speedNow;
    e.vx = damp(e.vx, (dirX * approach + sx) * sp, 0.15, dt);
    e.vy = damp(e.vy, (dirY * approach + sy) * sp, 0.15, dt);
  } else {
    const sp = e.speedNow * (d < engage ? 0.2 : 1);
    e.vx = damp(e.vx, dirX * sp, 0.14, dt);
    e.vy = damp(e.vy, dirY * sp, 0.14, dt);
  }

  if (Math.hypot(e.vx, e.vy) > 6) e.facing = angleLerpSafe(e.facing, Math.atan2(e.vy, e.vx), dt * 6);
  else e.facing = angleLerpSafe(e.facing, angleTo(e.x, e.y, p.x, p.y), dt * 4);

  if (d <= atk.range && e.attackCd <= 0) {
    e.attackCd = atk.cooldown * rand(0.85, 1.2);
    e.setState(atk.type === 'charge' ? 'chargeWindup' : 'windup');
    if (atk.type === 'charge') e.setState('windup');
    e.telegraph = {
      time: atk.windup, max: atk.windup,
      kind: atk.type, range: atk.range, arc: atk.arc || 1.2,
    };
  }
}

function angleLerpSafe(a, b, t) {
  return a + angleDiff(a, b) * clamp01(t);
}

export function performAttack(e, g, p) {
  const atk = e.def.attack;
  if (atk.type === 'melee') {
    sfx('swing');
    const a = angleTo(e.x, e.y, p.x, p.y);
    e.facing = a;
    const hit = g.playerInCone(e.x, e.y, a, atk.arc || 1.3, atk.range + 20);
    fx.arc(e.x, e.y, { angle: a, spread: atk.arc || 1.3, radius: atk.range, color: e.def.color, width: 20, life: 0.2, swing: 0.5 });
    if (hit) g.damagePlayer(e.damage, { source: e, angle: a, knockback: atk.knockback || 160 });
  } else if (atk.type === 'ranged') {
    sfx('cast');
    const a = angleTo(e.x, e.y, p.x, p.y) + rand(-atk.spread || 0, atk.spread || 0);
    const count = atk.count || 1;
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i - (count - 1) / 2) * (atk.fan || 0.18) : 0;
      g.projectile({
        x: e.x + Math.cos(a) * (e.r + 8), y: e.y + Math.sin(a) * (e.r + 8),
        angle: a + off, speed: atk.speed || 480, radius: atk.radius || 14, life: atk.life || 2.2,
        damage: e.damage, type: atk.damageType || 'physical', source: e, hostile: true,
        color: e.def.color, sprite: atk.sprite || 'orb', aoe: atk.aoe || 0,
      });
    }
  } else if (atk.type === 'charge') {
    e.facing = angleTo(e.x, e.y, p.x, p.y);
    e.setState('charge');
    sfx('swingHeavy');
  } else if (atk.type === 'custom') {
    atk.run(e, g, p);
  }
}

/* ── 투사체 ──────────────────────────────────────────────────────── */

export class Projectile {
  constructor(opts) {
    this.id = nextId();
    Object.assign(this, {
      radius: 12, speed: 600, life: 2, damage: 10, type: 'physical',
      pierce: 0, homing: 0, hostile: false, color: '#ffffff', sprite: 'orb',
      aoe: 0, aoeFalloff: 0.5, bounce: 0,
    }, opts);
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
    this.hitIds = new Set();
    this.dead = false;
    this.age = 0;
  }

  update(dt, g) {
    this.age += dt;
    this.life -= dt;
    if (this.homing) {
      const target = this.hostile ? g.player : g.nearestEnemy(this.x, this.y, 520, (e) => !this.hitIds.has(e.id));
      if (target) {
        const want = angleTo(this.x, this.y, target.x, target.y);
        const cur = Math.atan2(this.vy, this.vx);
        const na = cur + angleDiff(cur, want) * clamp01(this.homing * dt);
        const sp = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(na) * sp;
        this.vy = Math.sin(na) * sp;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.life <= 0) this.dead = true;
  }
}

/* ── 장판 ────────────────────────────────────────────────────────── */

export class Zone {
  constructor(opts) {
    this.id = nextId();
    Object.assign(this, { radius: 200, life: 4, tick: 0.5, color: 'rgba(255,255,255,0.1)', kind: 'zone' }, opts);
    this.max = this.life;
    this.acc = 0;
    this.dead = false;
  }

  update(dt, g) {
    this.life -= dt;
    this.acc += dt;
    if (this.acc >= this.tick) {
      this.acc -= this.tick;
      if (this.onTick) {
        for (const e of g.enemiesInRadius(this.x, this.y, this.radius)) this.onTick(e);
      }
      if (this.onPlayerTick && dist(this.x, this.y, g.player.x, g.player.y) < this.radius) this.onPlayerTick();
      if (this.onHostileTick && dist(this.x, this.y, g.player.x, g.player.y) < this.radius) this.onHostileTick();
    }
    if (this.life <= 0) this.dead = true;
  }
}

/* ── 바닥에 떨어지는 것들 ────────────────────────────────────────── */

export class Pickup {
  constructor(x, y, kind, value, item = null) {
    this.id = nextId();
    this.x = x; this.y = y;
    this.kind = kind;         // soul | aether | heal | item
    this.value = value;
    this.item = item;
    this.vx = rand(-160, 160);
    this.vy = rand(-160, 160);
    this.life = 40;
    this.age = 0;
    this.dead = false;
    this.r = 16;
  }

  update(dt, g) {
    this.age += dt;
    this.life -= dt;
    const p = g.player;
    const d = dist(this.x, this.y, p.x, p.y);
    const magnetRange = this.kind === 'item' ? 70 : 260;
    if (d < magnetRange && this.age > 0.3) {
      const a = angleTo(this.x, this.y, p.x, p.y);
      const pull = this.kind === 'item' ? 260 : 760 * (1 - d / magnetRange) + 160;
      this.vx = damp(this.vx, Math.cos(a) * pull, 0.08, dt);
      this.vy = damp(this.vy, Math.sin(a) * pull, 0.08, dt);
    } else {
      this.vx = damp(this.vx, 0, 0.2, dt);
      this.vy = damp(this.vy, 0, 0.2, dt);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (d < p.r + 18 && this.age > 0.25) {
      g.collect(this);
      this.dead = true;
    }
    if (this.life <= 0) this.dead = true;
  }
}

export const MAX_SKILL_RANK = MAX_RANK;
