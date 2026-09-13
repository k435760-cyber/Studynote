/* 장비. 층이 깊을수록 좋은 물건이 나오고, 옵션은 아이템 레벨에 비례해 커진다. */

import { rand, randInt, pick, nextId, formatNumber } from '../core/util.js';

export const RARITIES = {
  common:    { id: 'common',    name: '일반',  color: '#9aa6bd', affixes: 1, mul: 1.0,  weight: 100 },
  uncommon:  { id: 'uncommon',  name: '고급',  color: '#6fca8a', affixes: 2, mul: 1.16, weight: 56 },
  rare:      { id: 'rare',      name: '희귀',  color: '#5fa8f0', affixes: 3, mul: 1.34, weight: 26 },
  epic:      { id: 'epic',      name: '영웅',  color: '#b47cf0', affixes: 4, mul: 1.58, weight: 9 },
  legendary: { id: 'legendary', name: '전설',  color: '#f0a24e', affixes: 5, mul: 1.9, weight: 2.2 },
};

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const SLOTS = {
  weapon: { id: 'weapon', name: '무기' },
  armor:  { id: 'armor',  name: '방어구' },
  relic:  { id: 'relic',  name: '유물' },
};

const BASES = {
  weapon: [
    { name: '균열검', stat: 'damage', base: 0.09 },
    { name: '파쇄 도끼', stat: 'damage', base: 0.1 },
    { name: '봉인된 지팡이', stat: 'damage', base: 0.095 },
    { name: '속삭이는 단검', stat: 'damage', base: 0.085 },
    { name: '성흔의 철퇴', stat: 'damage', base: 0.092 },
  ],
  armor: [
    { name: '잿빛 갑주', stat: 'armor', base: 12 },
    { name: '가죽 흉갑', stat: 'armor', base: 9 },
    { name: '사제의 법복', stat: 'armor', base: 7 },
    { name: '그림자 외피', stat: 'armor', base: 8 },
    { name: '파수병의 판금', stat: 'armor', base: 14 },
  ],
  relic: [
    { name: '균열 조각', stat: 'crit', base: 0.02 },
    { name: '오래된 인장', stat: 'cdr', base: 0.025 },
    { name: '꺼지지 않는 등불', stat: 'hp', base: 22 },
    { name: '피 묻은 부적', stat: 'lifesteal', base: 0.015 },
    { name: '공명하는 결정', stat: 'damage', base: 0.045 },
  ],
};

const PREFIX = ['벼려진', '잿더미의', '서리 맺힌', '공허가 스민', '피에 젖은', '고요한', '갈라진', '별빛의', '잊혀진', '불타는'];
const SUFFIX = ['광휘', '집념', '심연', '맹세', '균열', '추적', '침묵', '잔영', '파문', '각인'];

/* 옵션 정의. value 는 아이템 레벨 1 기준이고 여기에 레벨과 등급 배율을 곱한다. */
const AFFIXES = [
  { key: 'damage',    name: '피해',            value: 0.018, percent: true,  weight: 100 },
  { key: 'crit',      name: '치명타 확률',      value: 0.0075, percent: true, weight: 78 },
  { key: 'critDmg',   name: '치명타 피해',      value: 0.026, percent: true,  weight: 70 },
  { key: 'hp',        name: '최대 생명력',      value: 11,    percent: false, weight: 96 },
  { key: 'armor',     name: '방어도',          value: 3.4,   percent: false, weight: 84 },
  { key: 'speed',     name: '이동 속도',        value: 0.007, percent: true,  weight: 52 },
  { key: 'cdr',       name: '재사용 대기시간 감소', value: 0.0075, percent: true, weight: 46 },
  { key: 'lifesteal', name: '흡혈',            value: 0.005, percent: true,  weight: 38 },
  { key: 'power',     name: '힘',              value: 1.5,   percent: false, weight: 70 },
  { key: 'agility',   name: '민첩',            value: 1.5,   percent: false, weight: 70 },
  { key: 'intellect', name: '지능',            value: 1.5,   percent: false, weight: 70 },
  { key: 'vitality',  name: '체력',            value: 1.5,   percent: false, weight: 70 },
];

function rollAffix(exclude) {
  const pool = AFFIXES.filter((a) => !exclude.has(a.key));
  let total = 0;
  for (const a of pool) total += a.weight;
  let r = rand(0, total);
  for (const a of pool) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return pool[0];
}

export function rollRarity(floor, luck = 0) {
  const bonus = 1 + floor * 0.035 + luck;
  const table = RARITY_ORDER.map((id) => {
    const r = RARITIES[id];
    const w = id === 'common' ? r.weight : r.weight * bonus;
    return { id, w };
  });
  let total = 0;
  for (const t of table) total += t.w;
  let x = rand(0, total);
  for (const t of table) {
    x -= t.w;
    if (x <= 0) return t.id;
  }
  return 'common';
}

export function makeItem(floor, opts = {}) {
  const slot = opts.slot || pick(['weapon', 'armor', 'relic']);
  const rarityId = opts.rarity || rollRarity(floor, opts.luck || 0);
  const rarity = RARITIES[rarityId];
  const ilvl = Math.max(1, opts.ilvl || floor + randInt(-1, 2));
  const base = pick(BASES[slot]);

  const stats = {};
  const levelMul = 1 + (ilvl - 1) * 0.22;
  stats[base.stat] = round(base.base * levelMul * rarity.mul, base.stat);

  const used = new Set([base.stat]);
  const lines = [];
  for (let i = 0; i < rarity.affixes; i++) {
    const a = rollAffix(used);
    if (!a) break;
    used.add(a.key);
    const v = round(a.value * levelMul * rarity.mul * rand(0.85, 1.2), a.key);
    stats[a.key] = (stats[a.key] || 0) + v;
    lines.push(a.key);
  }

  const name = rarityId === 'common'
    ? base.name
    : `${pick(PREFIX)} ${base.name}${rarityId === 'legendary' || rarityId === 'epic' ? ' · ' + pick(SUFFIX) : ''}`;

  return {
    uid: nextId(),
    slot, rarity: rarityId, ilvl, name,
    baseName: base.name,
    stats,
    score: itemScore({ stats }),
  };
}

function round(v, key) {
  const intKeys = ['hp', 'armor', 'power', 'agility', 'intellect', 'vitality'];
  return intKeys.includes(key) ? Math.max(1, Math.round(v)) : Math.round(v * 1000) / 1000;
}

/* 아이템끼리 비교할 때 쓰는 대략적인 점수. 완벽하진 않지만 방향은 맞는다. */
export function itemScore(item) {
  const s = item.stats || {};
  return Math.round(
    (s.damage || 0) * 900 +
    (s.crit || 0) * 700 +
    (s.critDmg || 0) * 300 +
    (s.hp || 0) * 0.9 +
    (s.armor || 0) * 1.4 +
    (s.speed || 0) * 1200 +
    (s.cdr || 0) * 1100 +
    (s.lifesteal || 0) * 1400 +
    ((s.power || 0) + (s.agility || 0) + (s.intellect || 0) + (s.vitality || 0)) * 7
  );
}

export function statLabel(key) {
  const found = AFFIXES.find((a) => a.key === key);
  if (found) return found.name;
  return key;
}

export function statText(key, value) {
  const found = AFFIXES.find((a) => a.key === key);
  const percent = found ? found.percent : ['damage', 'crit', 'critDmg', 'speed', 'cdr', 'lifesteal'].includes(key);
  if (percent) return `+${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
  return `+${formatNumber(value)}`;
}

/* 착용 중인 장비를 하나의 합계로 만든다. 플레이어는 이 합계만 본다. */
export function equipmentTotals(equipped) {
  const totals = {};
  for (const slot of Object.keys(SLOTS)) {
    const item = equipped[slot];
    if (!item) continue;
    for (const [k, v] of Object.entries(item.stats)) totals[k] = (totals[k] || 0) + v;
  }
  return totals;
}

export function compare(item, equipped) {
  const cur = equipped[item.slot];
  if (!cur) return { diff: item.score, better: true };
  return { diff: item.score - cur.score, better: item.score > cur.score };
}
