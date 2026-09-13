/* 자주 쓰는 수학·배열·문자열 도구. 여기에는 게임 규칙을 두지 않는다. */

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));

/* 프레임 시간에 상관없이 같은 속도로 따라붙는 보간.
   half 는 남은 거리가 절반이 되기까지 걸리는 시간(초)이다. */
export const damp = (a, b, half, dt) => b + (a - b) * Math.pow(2, -dt / half);

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeInQuad = (t) => t * t;
export const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

/* 각도 차이를 -π~π 로 접는다. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export const angleLerp = (a, b, t) => a + angleDiff(a, b) * t;

export function normalize(x, y) {
  const len = Math.hypot(x, y);
  return len > 0.00001 ? { x: x / len, y: y / len, len } : { x: 0, y: 0, len: 0 };
}

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const chance = (p) => Math.random() < p;
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function weightedPick(entries) {
  let total = 0;
  for (const e of entries) total += e.weight;
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.value;
  }
  return entries[entries.length - 1].value;
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* 던전을 같은 씨앗으로 다시 만들 수 있어야 해서 쓰는 결정론적 난수. */
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + next() * (b - a);
  next.int = (a, b) => Math.floor(a + next() * (b - a + 1));
  next.pick = (arr) => arr[(next() * arr.length) | 0];
  next.chance = (p) => next() < p;
  return next;
}

let idCounter = 1;
export const nextId = () => idCounter++;

export function formatNumber(n) {
  const v = Math.round(n);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* 큰 숫자는 자릿수를 줄여서 보여준다. HUD 처럼 자리가 좁은 곳에서 쓴다. */
export function shortNumber(n) {
  const v = Math.round(n);
  if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
  if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  return formatNumber(v);
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}시간 ${m % 60}분`;
  }
  return `${m}:${String(r).padStart(2, '0')}`;
}

/* 한글 받침에 따라 조사를 고른다. '수호력이', '기력이', '마나가' 처럼 자연스럽게. */
export function josa(word, pair = '이/가') {
  const [withBatchim, without] = pair.split('/');
  const last = String(word || '').trim().slice(-1);
  const code = last.charCodeAt(0);
  if (!last || code < 0xac00 || code > 0xd7a3) return withBatchim;
  return (code - 0xac00) % 28 ? withBatchim : without;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* 배열에서 죽은 객체를 걷어낸다. splice 를 반복하지 않으려고 뒤에서부터 채운다. */
export function compact(arr, isAlive) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    if (isAlive(arr[i])) arr[w++] = arr[i];
  }
  arr.length = w;
  return arr;
}

export const now = () => performance.now() / 1000;
