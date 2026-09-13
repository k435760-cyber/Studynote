/* 다섯 직업의 기본 능력치와 자원 규칙.
   숫자를 만질 때는 같은 층에서 다섯 직업이 비슷한 속도로 적을 녹이는지 보고 맞춘다. */

export const CLASS_LIST = ['guardian', 'oracle', 'berserker', 'arcanist', 'shade'];

export const CLASSES = {
  guardian: {
    id: 'guardian',
    name: '수호기사',
    role: '탱커',
    tagline: '맞으면서 앞을 여는 직업',
    detail: '피해를 받을수록 수호력이 차오릅니다. 앞장서서 적을 붙잡고, 위험한 순간을 방벽으로 지웁니다.',
    colors: { primary: '#5c86d6', glow: '#9fc4ff', trim: '#e2c98a', cloth: '#2c3b63' },
    base: { hp: 330, armor: 62, speed: 298, power: 12, agility: 6, intellect: 4, vitality: 14, crit: 0.05 },
    growth: { hp: 26, armor: 3.4, power: 1.5, agility: 0.6, intellect: 0.4, vitality: 1.6 },
    resource: { id: 'guard', name: '수호력', color: '#e2c98a', max: 100, regen: -3, onHitTaken: 26, onHitDealt: 5 },
    attack: {
      kind: 'melee', range: 152, arc: 1.55, cooldown: 0.42,
      combo: [0.95, 1.05, 1.45], knockback: 190, damageType: 'physical',
    },
    skills: ['bulwark', 'warcry', 'sunder'],
    ult: 'aegis',
    passive: {
      name: '강철 맹세',
      desc: '받은 피해에 비례해 수호력이 차오르고, 수호력이 60 이상이면 받는 피해가 18% 줄어듭니다.',
    },
  },

  oracle: {
    id: 'oracle',
    name: '신탁사제',
    role: '힐러',
    tagline: '스스로를 살리며 빛으로 태우는 직업',
    detail: '피해를 줄수록 신앙이 쌓입니다. 잃은 체력이 많을수록 회복량이 커져, 아슬아슬할수록 강해집니다.',
    colors: { primary: '#e8d9a8', glow: '#fff4cf', trim: '#c8a24e', cloth: '#4a4432' },
    base: { hp: 246, armor: 30, speed: 314, power: 5, agility: 8, intellect: 14, vitality: 9, crit: 0.07 },
    growth: { hp: 18, armor: 1.8, power: 0.6, agility: 0.9, intellect: 1.7, vitality: 1.1 },
    resource: { id: 'faith', name: '신앙', color: '#ffe9a8', max: 100, regen: 2.2, onHitDealt: 7, onHeal: 4 },
    attack: {
      kind: 'projectile', cooldown: 0.4, speed: 980, radius: 13, life: 1.1,
      coef: 0.92, pierce: 1, damageType: 'holy', color: '#ffe9a8',
    },
    skills: ['mend', 'judgement', 'sanctuary'],
    ult: 'covenant',
    passive: {
      name: '잃은 만큼의 자비',
      desc: '잃은 체력 1%마다 회복량이 1.2% 늘고, 넘친 회복량의 절반이 보호막으로 남습니다.',
    },
  },

  berserker: {
    id: 'berserker',
    name: '광전사',
    role: '딜러',
    tagline: '거리를 좁히고 몰아치는 직업',
    detail: '때리고 맞을수록 분노가 오릅니다. 체력이 낮을수록 피해가 커지는, 물러설 곳 없는 싸움꾼입니다.',
    colors: { primary: '#d15a3c', glow: '#ff9a6a', trim: '#efc07a', cloth: '#5a2a22' },
    base: { hp: 278, armor: 38, speed: 328, power: 15, agility: 10, intellect: 3, vitality: 10, crit: 0.12 },
    growth: { hp: 21, armor: 2.2, power: 2.1, agility: 1.1, intellect: 0.3, vitality: 1.2 },
    resource: { id: 'rage', name: '분노', color: '#ff8a5c', max: 100, regen: -4.5, onHitDealt: 8, onHitTaken: 12 },
    attack: {
      kind: 'melee', range: 168, arc: 1.75, cooldown: 0.3,
      combo: [0.82, 0.9, 1.42], knockback: 120, damageType: 'physical',
    },
    skills: ['rend', 'whirl', 'bloodlust'],
    ult: 'execute',
    passive: {
      name: '피의 각성',
      desc: '잃은 체력 1%마다 피해가 0.5% 늘고, 분노가 80을 넘으면 공격 속도가 20% 빨라집니다.',
    },
  },

  arcanist: {
    id: 'arcanist',
    name: '비전술사',
    role: '마법사',
    tagline: '원소를 겹쳐 터뜨리는 직업',
    detail: '서로 다른 원소를 잇달아 맞히면 공명이 터집니다. 자리를 잘 잡으면 화면을 통째로 지웁니다.',
    colors: { primary: '#7c6ddb', glow: '#b9a6ff', trim: '#64d4ff', cloth: '#2c2450' },
    base: { hp: 214, armor: 22, speed: 308, power: 4, agility: 8, intellect: 16, vitality: 7, crit: 0.09 },
    growth: { hp: 15, armor: 1.4, power: 0.4, agility: 0.8, intellect: 2.2, vitality: 0.9 },
    resource: { id: 'mana', name: '마나', color: '#9db8ff', max: 110, regen: 9.5 },
    attack: {
      kind: 'projectile', cooldown: 0.36, speed: 880, radius: 14, life: 1.2,
      coef: 0.86, pierce: 0, homing: 2.4, damageType: 'arcane', color: '#b9a6ff',
    },
    skills: ['fireball', 'frostnova', 'chain'],
    ult: 'meteor',
    passive: {
      name: '원소 공명',
      desc: '같은 적에게 다른 원소를 3초 안에 두 번 맞히면 공명이 터져 주변에 추가 피해를 줍니다.',
    },
  },

  shade: {
    id: 'shade',
    name: '그림자 자객',
    role: '암살자',
    tagline: '등 뒤를 잡고 끝내는 직업',
    detail: '빠른 공격으로 표식을 쌓고, 한 번에 몰아 터뜨립니다. 배후를 잡으면 치명타가 확정됩니다.',
    colors: { primary: '#4fd1b0', glow: '#9bffe4', trim: '#7a5cff', cloth: '#1d3038' },
    base: { hp: 228, armor: 25, speed: 356, power: 9, agility: 17, intellect: 6, vitality: 7, crit: 0.18 },
    growth: { hp: 16, armor: 1.6, power: 1.2, agility: 2.3, intellect: 0.6, vitality: 0.9 },
    resource: { id: 'energy', name: '기력', color: '#9bffe4', max: 100, regen: 17 },
    attack: {
      kind: 'melee', range: 132, arc: 1.25, cooldown: 0.2,
      combo: [0.52, 0.58, 0.74], knockback: 70, damageType: 'physical', comboPoint: true,
    },
    skills: ['shadowstep', 'venom', 'veil'],
    ult: 'reckoning',
    passive: {
      name: '표식',
      desc: '기본 공격마다 표식이 쌓입니다(최대 5). 스킬을 쓰면 표식을 모두 터뜨려 표식당 피해가 8% 늘어납니다.',
    },
  },
};

/* 레벨에 따라 자동으로 오르는 기본 능력치. 특성 포인트와는 별개다. */
export function baseStatsFor(classId, level) {
  const c = CLASSES[classId];
  const n = Math.max(0, level - 1);
  return {
    hp: c.base.hp + c.growth.hp * n,
    armor: c.base.armor + c.growth.armor * n,
    power: c.base.power + c.growth.power * n,
    agility: c.base.agility + c.growth.agility * n,
    intellect: c.base.intellect + c.growth.intellect * n,
    vitality: c.base.vitality + c.growth.vitality * n,
    crit: c.base.crit,
    speed: c.base.speed,
  };
}
