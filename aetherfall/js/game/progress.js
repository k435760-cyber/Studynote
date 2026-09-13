/* 저장 데이터와 영구 성장(각성). 직업마다 따로 키운다. */

import { CLASS_LIST } from './classes.js';
import { SKILLS } from './skills.js';
import { equipmentTotals } from './items.js';
import { clamp } from '../core/util.js';

export const SAVE_VERSION = 1;
const KEY = 'aetherfall.save.v1';

export const AWAKENING = {
  vitality: { id: 'vitality', name: '생명의 맹세', desc: '최대 생명력 +6%', max: 5, cost: (r) => 40 + r * 45, apply: (t, r) => { t.hp = (t.hp || 0) + 0.06 * r; } },
  might:    { id: 'might',    name: '예리함',     desc: '모든 피해 +5%',   max: 5, cost: (r) => 45 + r * 50, apply: (t, r) => { t.damage = (t.damage || 0) + 0.05 * r; } },
  swiftness:{ id: 'swiftness',name: '신속',       desc: '이동 속도 +3%',   max: 5, cost: (r) => 35 + r * 40, apply: (t, r) => { t.speed = (t.speed || 0) + 0.03 * r; } },
  essence:  { id: 'essence',  name: '정수의 그릇', desc: '자원 최대치 +8%', max: 5, cost: (r) => 35 + r * 40, apply: (t, r) => { t.resource = (t.resource || 0) + 0.08 * r; } },
  fortune:  { id: 'fortune',  name: '보고',       desc: '좋은 장비가 나올 확률 증가', max: 5, cost: (r) => 50 + r * 55, apply: (t, r) => { t.luck = (t.luck || 0) + 0.12 * r; } },
  defiance: { id: 'defiance', name: '불굴',       desc: '재사용 대기시간 감소 +4%', max: 5, cost: (r) => 55 + r * 60, apply: (t, r) => { t.cdr = (t.cdr || 0) + 0.04 * r; } },
};

export function newHero(classId) {
  const ranks = {};
  return {
    classId,
    level: 1,
    exp: 0,
    attributes: { power: 0, agility: 0, intellect: 0, vitality: 0 },
    skillRanks: ranks,
    equipped: { weapon: null, armor: null, relic: null },
    stash: [],
    bestDepth: 0,
    kills: 0,
    runs: 0,
  };
}

export function newSave() {
  const heroes = {};
  for (const id of CLASS_LIST) heroes[id] = newHero(id);
  return {
    version: SAVE_VERSION,
    classId: 'guardian',
    heroes,
    aether: 0,
    awakening: { vitality: 0, might: 0, swiftness: 0, essence: 0, fortune: 0, defiance: 0 },
    stats: { bestDepth: 0, totalKills: 0, runs: 0, playtime: 0, bosses: 0 },
    tutorialSeen: false,
    updatedAt: Date.now(),
  };
}

/* 저장 구조가 바뀌어도 예전 파일이 깨지지 않게 빈 칸을 메운다. */
export function normalize(save) {
  const base = newSave();
  const out = { ...base, ...save };
  out.heroes = { ...base.heroes, ...(save.heroes || {}) };
  for (const id of CLASS_LIST) {
    out.heroes[id] = { ...newHero(id), ...(out.heroes[id] || {}) };
    const h = out.heroes[id];
    h.attributes = { ...newHero(id).attributes, ...(h.attributes || {}) };
    h.skillRanks = h.skillRanks || {};
    h.equipped = { weapon: null, armor: null, relic: null, ...(h.equipped || {}) };
    h.stash = Array.isArray(h.stash) ? h.stash.slice(0, 60) : [];
  }
  out.awakening = { ...base.awakening, ...(save.awakening || {}) };
  out.stats = { ...base.stats, ...(save.stats || {}) };
  if (!CLASS_LIST.includes(out.classId)) out.classId = 'guardian';
  out.version = SAVE_VERSION;
  return out;
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

export function saveLocal(save) {
  try {
    save.updatedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearLocal() {
  try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
}

export function awakeningTotals(save) {
  const t = {};
  for (const node of Object.values(AWAKENING)) {
    const r = save.awakening[node.id] || 0;
    if (r > 0) node.apply(t, r);
  }
  return t;
}

export function awakeningCost(nodeId, currentRank) {
  const node = AWAKENING[nodeId];
  if (!node || currentRank >= node.max) return null;
  return node.cost(currentRank);
}

export function totalPoints(level) {
  return {
    attribute: level - 1,
    skill: Math.floor((level - 1) / 2) + 1,
  };
}

export function spentPoints(hero) {
  const attr = Object.values(hero.attributes).reduce((a, b) => a + b, 0);
  let skill = 0;
  for (const [id, rank] of Object.entries(hero.skillRanks)) {
    if (!SKILLS[id]) continue;
    for (let r = 1; r < rank; r++) skill += r;
  }
  return { attribute: attr, skill };
}

export function availablePoints(hero) {
  const total = totalPoints(hero.level);
  const spent = spentPoints(hero);
  return {
    attribute: Math.max(0, total.attribute - spent.attribute),
    skill: Math.max(0, total.skill - spent.skill),
  };
}

/* 플레이어 객체를 만들 때 넘기는 형태로 바꾼다. */
export function heroProfile(save, classId = save.classId) {
  const hero = save.heroes[classId];
  return {
    classId,
    level: hero.level,
    exp: hero.exp,
    attributes: hero.attributes,
    skillRanks: hero.skillRanks,
    equipment: { totals: equipmentTotals(hero.equipped), items: hero.equipped },
    awakening: { totals: awakeningTotals(save) },
  };
}

export function luckOf(save) {
  return clamp(awakeningTotals(save).luck || 0, 0, 1);
}
