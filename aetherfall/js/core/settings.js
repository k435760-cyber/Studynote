/* 환경 설정. 값은 브라우저에 저장되고 계정과는 무관하다. */

const KEY = 'aetherfall.settings.v1';

export const QUALITY = {
  ultra: {
    id: 'ultra', label: '최상',
    maxWidth: 2560, maxHeight: 1440, dprCap: 2,
    particles: 1600, bloom: true, lights: true, decals: 420, shadows: true, afterimages: true,
  },
  high: {
    id: 'high', label: '높음',
    maxWidth: 1920, maxHeight: 1080, dprCap: 2,
    particles: 1000, bloom: true, lights: true, decals: 260, shadows: true, afterimages: true,
  },
  medium: {
    id: 'medium', label: '보통',
    maxWidth: 1600, maxHeight: 900, dprCap: 1.5,
    particles: 560, bloom: false, lights: true, decals: 140, shadows: true, afterimages: false,
  },
  low: {
    id: 'low', label: '낮음',
    maxWidth: 1280, maxHeight: 720, dprCap: 1,
    particles: 260, bloom: false, lights: false, decals: 60, shadows: false, afterimages: false,
  },
};

const DEFAULTS = {
  quality: 'high',
  master: 0.8,
  sfx: 0.9,
  music: 0.45,
  shake: 1,
  flash: 1,
  damageNumbers: true,
  showFps: false,
  autoAim: 'auto',      // auto | always | never  (터치는 항상 보정)
  minimap: true,
  joystickSide: 'left',
  vibration: true,
  specNoticeSeen: false,
};

export const settings = { ...DEFAULTS };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (e) {
    /* 저장소가 막혀 있으면 기본값으로 간다. */
  }
  if (!QUALITY[settings.quality]) settings.quality = 'high';
  return settings;
}

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (e) { /* 무시 */ }
}

export function quality() {
  return QUALITY[settings.quality] || QUALITY.high;
}

export function setQuality(id) {
  if (!QUALITY[id]) return;
  settings.quality = id;
  saveSettings();
}
