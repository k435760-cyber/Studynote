/* 키보드·마우스·터치 조이스틱·게임패드를 한 곳으로 모은다.
   게임 로직은 여기서 나온 move/aim/액션만 본다. */

const ACTIONS = ['attack', 'dodge', 'skill1', 'skill2', 'skill3', 'ult', 'pause', 'inventory', 'map'];

const KEY_ACTION = {
  Space: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge',
  KeyJ: 'attack',
  KeyQ: 'skill1', KeyE: 'skill2', KeyR: 'skill3', KeyF: 'ult',
  Escape: 'pause', Tab: 'inventory', KeyI: 'inventory', KeyM: 'map',
};

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

const GAMEPAD_BUTTON = {
  0: 'dodge', 2: 'skill1', 3: 'skill2', 5: 'skill3', 4: 'ult', 7: 'attack', 9: 'pause', 8: 'inventory',
};

function makeState() {
  const held = {}, pressed = {}, released = {};
  for (const a of ACTIONS) { held[a] = false; pressed[a] = false; released[a] = false; }
  return { held, pressed, released };
}

export const input = {
  move: { x: 0, y: 0 },
  aimScreen: { x: 0, y: 0 },    // CSS 픽셀 기준 화면 좌표
  aimVector: { x: 1, y: 0 },    // 패드·터치로 조준할 때의 방향
  usingPointer: false,
  usingPad: false,
  touchMode: false,
  joystick: { active: false, ox: 0, oy: 0, x: 0, y: 0, id: -1, radius: 92 },
  enabled: true,
  _keys: new Set(),
  _virtual: new Set(),
  _state: makeState(),
  _queue: [],
  _padIndex: -1,
  _canvas: null,
};

function fire(action, down) {
  if (!ACTIONS.includes(action)) return;
  input._queue.push({ action, down });
}

export function attachInput(canvas) {
  input._canvas = canvas;
  input.touchMode = matchMedia('(pointer: coarse)').matches;

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Tab') e.preventDefault();
    if (MOVE_KEYS[e.code] || KEY_ACTION[e.code]) input.usingPad = false;
    if (!input._keys.has(e.code)) {
      input._keys.add(e.code);
      const a = KEY_ACTION[e.code];
      if (a) fire(a, true);
    }
  });

  addEventListener('keyup', (e) => {
    input._keys.delete(e.code);
    const a = KEY_ACTION[e.code];
    if (a) fire(a, false);
  });

  addEventListener('blur', () => {
    input._keys.clear();
    input._virtual.clear();
    input.joystick.active = false;
    for (const a of ACTIONS) {
      if (input._state.held[a]) fire(a, false);
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    input.usingPointer = true;
    input.usingPad = false;
    input.aimScreen.x = e.clientX;
    input.aimScreen.y = e.clientY;
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') { onTouchStart(e); return; }
    input.usingPointer = true;
    input.aimScreen.x = e.clientX;
    input.aimScreen.y = e.clientY;
    if (e.button === 0) fire('attack', true);
    if (e.button === 2) fire('dodge', true);
    canvas.setPointerCapture?.(e.pointerId);
  });

  addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') { onTouchEnd(e); return; }
    if (e.button === 0) fire('attack', false);
    if (e.button === 2) fire('dodge', false);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') return;
    onTouchMove(e);
  });
  addEventListener('pointercancel', onTouchEnd);

  addEventListener('gamepadconnected', (e) => { input._padIndex = e.gamepad.index; });
  addEventListener('gamepaddisconnected', () => { input._padIndex = -1; });
}

/* 화면 왼쪽(설정에 따라 오른쪽) 절반을 누르면 그 자리에 조이스틱이 생긴다.
   고정식보다 손가락 위치를 덜 신경 써도 되어 이동이 훨씬 편하다. */
function onTouchStart(e) {
  input.touchMode = true;
  const j = input.joystick;
  const half = innerWidth * 0.5;
  const onStickSide = e.clientX < half;
  if (!j.active && onStickSide) {
    j.active = true;
    j.id = e.pointerId;
    j.ox = e.clientX; j.oy = e.clientY;
    j.x = 0; j.y = 0;
  }
}

function onTouchMove(e) {
  const j = input.joystick;
  if (!j.active || e.pointerId !== j.id) return;
  const dx = e.clientX - j.ox;
  const dy = e.clientY - j.oy;
  const len = Math.hypot(dx, dy);
  const max = j.radius;
  if (len > max) {
    /* 끝까지 밀었으면 중심을 따라오게 해서 손가락이 미끄러져도 끊기지 않게 한다. */
    j.ox += dx * (1 - max / len);
    j.oy += dy * (1 - max / len);
    j.x = (dx / len);
    j.y = (dy / len);
  } else {
    j.x = dx / max;
    j.y = dy / max;
  }
}

function onTouchEnd(e) {
  const j = input.joystick;
  if (j.active && e.pointerId === j.id) {
    j.active = false;
    j.id = -1;
    j.x = 0; j.y = 0;
  }
}

/* HUD 의 터치 버튼이 부르는 통로. */
export function setVirtual(action, down) {
  if (down) {
    if (!input._virtual.has(action)) { input._virtual.add(action); fire(action, true); }
  } else if (input._virtual.has(action)) {
    input._virtual.delete(action);
    fire(action, false);
  }
}

function pollGamepad() {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  let pad = input._padIndex >= 0 ? pads[input._padIndex] : null;
  if (!pad) {
    for (const p of pads) { if (p && p.connected) { pad = p; input._padIndex = p.index; break; } }
  }
  if (!pad) return;

  const dead = 0.22;
  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  if (Math.hypot(ax, ay) > dead) {
    input.move.x += ax; input.move.y += ay;
    input.usingPad = true; input.usingPointer = false;
  }
  const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
  if (Math.hypot(rx, ry) > dead) {
    input.aimVector.x = rx; input.aimVector.y = ry;
    input.usingPad = true; input.usingPointer = false;
  }
  for (const [idx, action] of Object.entries(GAMEPAD_BUTTON)) {
    const btn = pad.buttons[idx];
    if (!btn) continue;
    const down = btn.pressed || btn.value > 0.5;
    const key = 'pad' + idx;
    const was = input._keys.has(key);
    if (down && !was) { input._keys.add(key); fire(action, true); input.usingPad = true; }
    else if (!down && was) { input._keys.delete(key); fire(action, false); }
  }
}

/* 매 프레임 맨 앞에서 부른다. 눌림/뗌은 이 프레임 동안만 참이다. */
export function updateInput() {
  const st = input._state;
  for (const a of ACTIONS) { st.pressed[a] = false; st.released[a] = false; }

  for (const ev of input._queue) {
    if (!input.enabled && ev.action !== 'pause') continue;
    if (ev.down) {
      if (!st.held[ev.action]) st.pressed[ev.action] = true;
      st.held[ev.action] = true;
    } else {
      if (st.held[ev.action]) st.released[ev.action] = true;
      st.held[ev.action] = false;
    }
  }
  input._queue.length = 0;

  let mx = 0, my = 0;
  if (input.enabled) {
    for (const code of input._keys) {
      const v = MOVE_KEYS[code];
      if (v) { mx += v[0]; my += v[1]; }
    }
    if (input.joystick.active) { mx += input.joystick.x; my += input.joystick.y; }
  }
  input.move.x = mx; input.move.y = my;
  if (input.enabled) pollGamepad();

  const len = Math.hypot(input.move.x, input.move.y);
  if (len > 1) { input.move.x /= len; input.move.y /= len; }
}

export const held = (a) => input._state.held[a];
export const pressed = (a) => input._state.pressed[a];
export const released = (a) => input._state.released[a];

export function clearActions() {
  const st = input._state;
  for (const a of ACTIONS) { st.held[a] = false; st.pressed[a] = false; st.released[a] = false; }
  input._virtual.clear();
  input._queue.length = 0;
}
