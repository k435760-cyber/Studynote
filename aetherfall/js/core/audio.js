/* 소리는 전부 WebAudio 로 직접 만든다. 내려받을 파일이 없으니 첫 실행이 빠르고
   오프라인에서도 그대로 들린다. */

import { settings } from './settings.js';
import { clamp, rand } from './util.js';

let ctx = null;
let master = null, sfxBus = null, musicBus = null;
let noiseBuffer = null;
let started = false;

const music = {
  timer: 0, step: 0, intensity: 0, target: 0, playing: false, nextTime: 0, bar: 0,
};

/* 단조 기반 진행. 던전 분위기에 맞춰 어둡게. */
const SCALE = [0, 3, 5, 7, 10, 12, 15];
const CHORDS = [
  [55.00, 65.41, 82.41],   // Am 계열
  [49.00, 58.27, 73.42],   // G
  [43.65, 51.91, 65.41],   // F
  [48.99, 58.27, 77.78],   // G / B
];

export function audioReady() { return started; }

export function initAudio() {
  if (started) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC({ latencyHint: 'interactive' });

  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 22;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  master.connect(comp).connect(ctx.destination);

  sfxBus = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus.connect(master);
  musicBus.connect(master);

  const len = Math.floor(ctx.sampleRate * 1.2);
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  started = true;
  applyVolumes();
  return true;
}

export function applyVolumes() {
  if (!started) return;
  master.gain.value = clamp(settings.master, 0, 1);
  sfxBus.gain.value = clamp(settings.sfx, 0, 1) * 0.9;
  musicBus.gain.value = clamp(settings.music, 0, 1) * 0.5;
}

export function resumeAudio() {
  if (!started) initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function env(node, t0, attack, hold, release, peak) {
  const g = node.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

function tone({ freq = 220, to = null, type = 'sine', dur = 0.2, gain = 0.3, attack = 0.005, delay = 0, pan = 0, detune = 0 }) {
  if (!started) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  if (detune) osc.detune.value = detune;
  env(g, t0, attack, dur * 0.2, dur, gain);
  let out = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    g.connect(p);
    out = p;
  }
  osc.connect(g);
  out.connect(sfxBus);
  osc.start(t0);
  osc.stop(t0 + dur * 1.4 + 0.05);
}

function noise({ dur = 0.2, gain = 0.3, freq = 1200, q = 1, type = 'bandpass', sweepTo = null, delay = 0, attack = 0.002 }) {
  if (!started) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  src.playbackRate.value = rand(0.9, 1.1);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t0);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, attack, dur * 0.15, dur, gain);
  src.connect(filter).connect(g).connect(sfxBus);
  src.start(t0, rand(0, 0.8));
  src.stop(t0 + dur * 1.4 + 0.05);
}

const RECIPES = {
  ui:        () => { tone({ freq: 620, to: 760, type: 'triangle', dur: 0.07, gain: 0.16 }); },
  uiBack:    () => { tone({ freq: 420, to: 280, type: 'triangle', dur: 0.09, gain: 0.14 }); },
  error:     () => { tone({ freq: 180, to: 120, type: 'square', dur: 0.16, gain: 0.12 }); },

  swing:     () => { noise({ dur: 0.13, gain: 0.2, freq: 1800, sweepTo: 520, q: 0.8 }); },
  swingHeavy:() => { noise({ dur: 0.22, gain: 0.3, freq: 1200, sweepTo: 240, q: 0.9 });
                     tone({ freq: 150, to: 60, type: 'sine', dur: 0.18, gain: 0.22 }); },
  hit:       () => { noise({ dur: 0.09, gain: 0.32, freq: 900, sweepTo: 300, q: 1.4 });
                     tone({ freq: 190, to: 80, type: 'triangle', dur: 0.1, gain: 0.22 }); },
  hitCrit:   () => { noise({ dur: 0.14, gain: 0.4, freq: 2400, sweepTo: 400, q: 2 });
                     tone({ freq: 420, to: 110, type: 'square', dur: 0.16, gain: 0.2 }); },
  block:     () => { tone({ freq: 900, to: 1400, type: 'square', dur: 0.09, gain: 0.14 });
                     noise({ dur: 0.14, gain: 0.22, freq: 3200, q: 3 }); },
  hurt:      () => { tone({ freq: 260, to: 90, type: 'sawtooth', dur: 0.22, gain: 0.2 });
                     noise({ dur: 0.16, gain: 0.18, freq: 500, sweepTo: 160, q: 0.7 }); },

  cast:      () => { tone({ freq: 320, to: 880, type: 'sine', dur: 0.2, gain: 0.16 }); },
  fire:      () => { noise({ dur: 0.32, gain: 0.3, freq: 700, sweepTo: 140, q: 0.6 });
                     tone({ freq: 220, to: 70, type: 'sawtooth', dur: 0.3, gain: 0.16 }); },
  explode:   () => { noise({ dur: 0.55, gain: 0.45, freq: 420, sweepTo: 60, q: 0.5 });
                     tone({ freq: 110, to: 34, type: 'sine', dur: 0.5, gain: 0.34 }); },
  ice:       () => { tone({ freq: 1400, to: 700, type: 'triangle', dur: 0.28, gain: 0.14 });
                     noise({ dur: 0.3, gain: 0.2, freq: 4200, q: 6 }); },
  shock:     () => { noise({ dur: 0.2, gain: 0.28, freq: 3600, sweepTo: 900, q: 5 });
                     tone({ freq: 1200, to: 300, type: 'square', dur: 0.12, gain: 0.1 }); },
  holy:      () => { tone({ freq: 660, to: 990, type: 'sine', dur: 0.4, gain: 0.14 });
                     tone({ freq: 990, to: 1320, type: 'sine', dur: 0.36, gain: 0.08, delay: 0.05 }); },
  poison:    () => { noise({ dur: 0.3, gain: 0.16, freq: 600, sweepTo: 220, q: 2.4 }); },
  dash:      () => { noise({ dur: 0.18, gain: 0.22, freq: 2400, sweepTo: 400, q: 1.2 }); },
  heal:      () => { tone({ freq: 520, to: 780, type: 'sine', dur: 0.34, gain: 0.16 });
                     tone({ freq: 780, to: 1040, type: 'sine', dur: 0.3, gain: 0.1, delay: 0.07 }); },
  shieldUp:  () => { tone({ freq: 180, to: 420, type: 'triangle', dur: 0.35, gain: 0.2 });
                     noise({ dur: 0.3, gain: 0.12, freq: 1800, q: 4 }); },
  stealth:   () => { noise({ dur: 0.45, gain: 0.18, freq: 1400, sweepTo: 260, q: 1.6 }); },

  die:       () => { tone({ freq: 240, to: 60, type: 'sawtooth', dur: 0.4, gain: 0.22 });
                     noise({ dur: 0.4, gain: 0.22, freq: 800, sweepTo: 120, q: 0.7 }); },
  dieBig:    () => { tone({ freq: 160, to: 38, type: 'sawtooth', dur: 0.9, gain: 0.3 });
                     noise({ dur: 0.9, gain: 0.3, freq: 500, sweepTo: 60, q: 0.5 }); },
  roar:      () => { tone({ freq: 90, to: 44, type: 'sawtooth', dur: 1.2, gain: 0.34 });
                     noise({ dur: 1.1, gain: 0.24, freq: 300, sweepTo: 90, q: 1.2 }); },
  loot:      () => { tone({ freq: 880, to: 1320, type: 'triangle', dur: 0.12, gain: 0.14 });
                     tone({ freq: 1320, to: 1760, type: 'triangle', dur: 0.14, gain: 0.1, delay: 0.08 }); },
  chest:     () => { tone({ freq: 300, to: 520, type: 'triangle', dur: 0.2, gain: 0.16 });
                     noise({ dur: 0.3, gain: 0.14, freq: 2600, q: 3, delay: 0.05 }); },
  portal:    () => { tone({ freq: 140, to: 560, type: 'sine', dur: 0.7, gain: 0.2 });
                     noise({ dur: 0.7, gain: 0.14, freq: 900, sweepTo: 2600, q: 2 }); },
  levelUp:   () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone({ freq: f, type: 'triangle', dur: 0.35, gain: 0.16, delay: i * 0.07 });
    });
  },
  ultReady:  () => { tone({ freq: 440, to: 880, type: 'sine', dur: 0.5, gain: 0.16 });
                     tone({ freq: 220, to: 440, type: 'triangle', dur: 0.5, gain: 0.12 }); },
};

export function sfx(name, opts = {}) {
  if (!started || !RECIPES[name]) return;
  if (ctx.state === 'suspended') ctx.resume();
  RECIPES[name](opts);
}

/* --- 배경 음악 --------------------------------------------------------- */

function schedule(time) {
  const beat = music.step % 16;
  const chord = CHORDS[music.bar % CHORDS.length];
  const inten = music.intensity;

  if (beat === 0) {
    for (let i = 0; i < chord.length; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = chord[i] * 2;
      o.detune.value = rand(-6, 6);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.09 + inten * 0.05, time + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 3.8);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500 + inten * 1400;
      o.connect(f).connect(g).connect(musicBus);
      o.start(time);
      o.stop(time + 4);
    }
    music.bar++;
  }

  /* 저음 맥박. 전투가 격해질수록 세게 친다. */
  if (beat % 4 === 0) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(86, time);
    o.frequency.exponentialRampToValueAtTime(38, time + 0.22);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.16 + inten * 0.2, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
    o.connect(g).connect(musicBus);
    o.start(time);
    o.stop(time + 0.45);
  }

  if (inten > 0.35 && (beat === 6 || beat === 14 || (inten > 0.7 && beat % 2 === 1))) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 5200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.05 + inten * 0.06, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    src.connect(f).connect(g).connect(musicBus);
    src.start(time, rand(0, 0.5));
    src.stop(time + 0.12);
  }

  if (inten > 0.15 && beat % 8 === 2) {
    const note = chord[0] * 4 * Math.pow(2, SCALE[(music.step / 2 | 0) % SCALE.length] / 12);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = note;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.03 + inten * 0.03, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.7);
    o.connect(g).connect(musicBus);
    o.start(time);
    o.stop(time + 0.75);
  }
}

export function startMusic() {
  if (!started || music.playing) return;
  music.playing = true;
  music.nextTime = ctx.currentTime + 0.1;
  music.step = 0;
  music.bar = 0;
}

export function stopMusic() {
  music.playing = false;
}

export function setMusicIntensity(v) {
  music.target = clamp(v, 0, 1);
}

/* 메인 루프에서 매 프레임 부른다. 0.4초 앞을 미리 예약해 둔다. */
export function updateAudio(dt) {
  if (!started) return;
  music.intensity += (music.target - music.intensity) * Math.min(1, dt * 1.6);
  if (!music.playing || ctx.state !== 'running') return;
  const spb = 60 / 96 / 2;     // 96BPM 의 8분음표
  while (music.nextTime < ctx.currentTime + 0.4) {
    schedule(music.nextTime);
    music.nextTime += spb;
    music.step++;
  }
}
