/* 화면 전환, 모달, 알림, 아이콘. DOM 으로 만든 것은 전부 여기를 거친다. */

import { sfx } from '../core/audio.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  if (html) node.innerHTML = html;
  return node;
}

/* 선으로만 그린 아이콘. 색은 currentColor 를 따라간다. */
const I = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const ICONS = {
  'shield-bash': I('<path d="M12 2.6 19 5.4v6.2c0 4.4-3 7.6-7 9.8-4-2.2-7-5.4-7-9.8V5.4Z"/><path d="M9.2 9.2 14.8 14.8M14.8 9.2 9.2 14.8"/>'),
  warcry: I('<path d="M4 10v4h3l5 4V6l-5 4Z"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M18.8 6a8.5 8.5 0 0 1 0 12"/>'),
  sunder: I('<path d="M3 19h18"/><path d="M8 19 11 9l2 4 2-6 2 12"/><path d="M6 15l1.4-3"/>'),
  aegis: I('<path d="m12 2.4 8 4v6c0 4.6-3.4 8-8 9.2-4.6-1.2-8-4.6-8-9.2v-6Z"/><path d="m8.6 11.6 2.4 2.4 4.4-4.6"/>'),
  mend: I('<path d="M12 20.4S4.2 15.6 4.2 10.2A4.2 4.2 0 0 1 12 7.8a4.2 4.2 0 0 1 7.8 2.4c0 5.4-7.8 10.2-7.8 10.2Z"/><path d="M9 12h2l1-2 1.4 3.4L15 12h1.6"/>'),
  judgement: I('<path d="M12 2v9"/><path d="m8 8 4 4 4-4"/><path d="M5 15h14"/><path d="m7.4 19.4 1.4-2.4M12 21v-3.6M16.6 19.4 15.2 17"/>'),
  sanctuary: I('<circle cx="12" cy="12" r="5.4"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19"/>'),
  covenant: I('<path d="M12 3.2 14.6 9H21l-5 4 1.8 6.4L12 15.8 6.2 19.4 8 13 3 9h6.4Z"/>'),
  rend: I('<path d="M3 20 20 4"/><path d="M14 4h6v6"/><path d="M4 12.5 9 17"/>'),
  whirl: I('<path d="M12 5.2A6.8 6.8 0 1 1 5.6 9.8"/><path d="M5 5.6 5.6 10l4.4-.6"/><path d="M12 9.6a2.4 2.4 0 1 0 0 4.8"/>'),
  bloodlust: I('<path d="M12 3c3.2 3.6 5.4 6.4 5.4 9.4A5.4 5.4 0 1 1 6.6 12.4C6.6 9.4 8.8 6.6 12 3Z"/><path d="M9.8 13.4a2.4 2.4 0 0 0 4.4 1.2"/>'),
  execute: I('<path d="M4.6 19.4 14 10"/><path d="M13 4.6c2.6-1 5.4.4 6.2 3s-.6 5.4-3 6.4l-1.4-3.2-3.2-1.4Z"/><path d="m4 20 2.4-.8-1.6-1.6Z"/>'),
  fireball: I('<path d="M12 3c.6 3 3.2 4 4.4 6.6a5.6 5.6 0 1 1-10 2.6C6.4 8.6 9.6 7.6 12 3Z"/><path d="M12 20a2.8 2.8 0 0 0 2.2-4.4c-.8-1.2-2.2-1.6-2.2-3.2-1.6 1.6-2.6 2.6-2.6 4.4A2.8 2.8 0 0 0 12 20Z"/>'),
  frost: I('<path d="M12 2.4v19.2M3.7 7.2l16.6 9.6M20.3 7.2 3.7 16.8"/><path d="M12 6.4 9.6 4M12 6.4 14.4 4M12 17.6 9.6 20M12 17.6l2.4 2.4"/>'),
  chain: I('<path d="M13.4 2.4 5.6 13.2h5L9.4 21.6l8.6-11.2h-5.2Z"/>'),
  meteor: I('<circle cx="15.6" cy="8.4" r="4.4"/><path d="M11 13 3.6 20.4"/><path d="M8.4 12.6 5 14M11.4 15.6 10 19"/>'),
  shadowstep: I('<path d="M4 18c3-1.4 5-3.6 5-6.4 0-2-1.2-3.4-1.2-3.4"/><ellipse cx="16.6" cy="12" rx="3.4" ry="5.4"/><path d="M12.6 8.6 16 12l-3.4 3.4"/>'),
  venom: I('<path d="M14.8 3.2 9.4 14.4l-2.8-1.2Z"/><path d="M8 15.6 5.6 20.4"/><path d="M15.4 14.6a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6ZM19 10.4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z"/>'),
  veil: I('<path d="M5.6 16.4a3.6 3.6 0 0 1 .6-7.1 5 5 0 0 1 9.5-1.5 4 4 0 0 1 2.7 7.6"/><path d="M4 20h16"/>'),
  reckoning: I('<path d="M5 3.6 14 16.4"/><path d="M19 3.6 10 16.4"/><path d="M7.4 17.6 5 20.4M16.6 17.6 19 20.4"/><path d="M12 6.4v3"/>'),

  attack: I('<path d="M4 20 18.4 5.6"/><path d="M14.6 3.6h5.8v5.8"/><path d="m4.4 19.6 3-1-2-2Z"/>'),
  dodge: I('<path d="M6 12h11"/><path d="m13 8 4 4-4 4"/><circle cx="4" cy="12" r="1.4"/>'),
  menu: I('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: I('<path d="M6 6 18 18M18 6 6 18"/>'),
  google: '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1Z"/></svg>',
  crown: I('<path d="M4 18h16"/><path d="m4 15 1.4-8 4.2 4L12 5.4l2.4 5.6 4.2-4L20 15Z"/>'),
  gear: I('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v2.8M12 18.6v2.8M21.4 12h-2.8M5.4 12H2.6M18.6 5.4l-2 2M7.4 16.6l-2 2M18.6 18.6l-2-2M7.4 7.4l-2-2"/>'),
  bag: I('<path d="M4.6 8h14.8l-1.2 12H5.8Z"/><path d="M8.6 8V6a3.4 3.4 0 0 1 6.8 0v2"/>'),
  star: I('<path d="m12 3.6 2.6 5.6 6 .8-4.4 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.4 10l6-.8Z"/>'),
  spark: I('<path d="M12 2.6v5M12 16.4v5M2.6 12h5M16.4 12h5"/><path d="m5.8 5.8 3 3M15.2 15.2l3 3M18.2 5.8l-3 3M8.8 15.2l-3 3"/>'),
  heart: I('<path d="M12 20.4S4.2 15.6 4.2 10.2A4.2 4.2 0 0 1 12 7.8a4.2 4.2 0 0 1 7.8 2.4c0 5.4-7.8 10.2-7.8 10.2Z"/>'),
  download: I('<path d="M12 3.6v11"/><path d="m7.6 10.2 4.4 4.4 4.4-4.4"/><path d="M4.6 19.4h14.8"/>'),
  check: I('<path d="m5 12.8 4.6 4.6L19 6.8"/>'),
  warn: I('<path d="M12 4.2 21 19.4H3Z"/><path d="M12 10v4.2M12 16.8v.2"/>'),
};

export function icon(name, extraClass = '') {
  return `<span class="icon ${extraClass}">${ICONS[name] || ICONS.spark}</span>`;
}

/* ── 화면 전환 ─────────────────────────────────────────────────── */

const screens = new Map();
let current = null;
let host = null;

export function initUI(hostEl) {
  host = hostEl;
}

export function registerScreen(name, node) {
  node.classList.add('screen');
  node.dataset.screen = name;
  node.hidden = true;
  host.appendChild(node);
  screens.set(name, node);
  return node;
}

export function showScreen(name, silent = false) {
  if (current === name) return;
  for (const [key, node] of screens) {
    if (key === name) continue;
    if (!node.hidden) {
      node.classList.remove('screen--in');
      node.hidden = true;
    }
  }
  const node = screens.get(name);
  if (node) {
    node.hidden = false;
    /* 다음 프레임에 클래스를 붙여야 전환 효과가 보인다. */
    requestAnimationFrame(() => node.classList.add('screen--in'));
  }
  current = name;
  document.body.dataset.screen = name || '';
  if (!silent) sfx('ui');
}

export function hideScreens() {
  for (const node of screens.values()) {
    node.hidden = true;
    node.classList.remove('screen--in');
  }
  current = null;
  document.body.dataset.screen = '';
}

export const currentScreen = () => current;
export const screenNode = (name) => screens.get(name);

/* ── 알림 ─────────────────────────────────────────────────────── */

let toastHost = null;

export function initToasts(node) {
  toastHost = node;
}

export function toast(text, kind = 'info') {
  if (!toastHost) return;
  const node = el('div', { class: `toast toast--${kind}` }, text);
  toastHost.appendChild(node);
  requestAnimationFrame(() => node.classList.add('toast--in'));
  setTimeout(() => {
    node.classList.remove('toast--in');
    setTimeout(() => node.remove(), 400);
  }, 2600);
  while (toastHost.children.length > 4) toastHost.firstChild.remove();
}

/* ── 모달 ─────────────────────────────────────────────────────── */

let modalHost = null;

export function initModal(node) {
  modalHost = node;
}

export function modal({ title, body, actions = [{ label: '확인', value: true }], dismissable = true }) {
  return new Promise((resolve) => {
    modalHost.innerHTML = '';
    const card = el('div', { class: 'modal__card' });
    card.appendChild(el('h3', { class: 'modal__title', text: title }));
    const bodyNode = el('div', { class: 'modal__body' });
    if (typeof body === 'string') bodyNode.innerHTML = body;
    else if (body) bodyNode.appendChild(body);
    card.appendChild(bodyNode);

    const row = el('div', { class: 'modal__actions' });
    for (const a of actions) {
      const btn = el('button', { class: `btn ${a.primary ? 'btn--primary' : ''} ${a.danger ? 'btn--danger' : ''}`, type: 'button', text: a.label });
      btn.addEventListener('click', () => {
        close();
        resolve(a.value);
      });
      row.appendChild(btn);
    }
    card.appendChild(row);
    modalHost.appendChild(card);
    modalHost.hidden = false;
    requestAnimationFrame(() => modalHost.classList.add('modal--in'));
    sfx('ui');

    function close() {
      modalHost.classList.remove('modal--in');
      setTimeout(() => { modalHost.hidden = true; modalHost.innerHTML = ''; }, 220);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape' && dismissable) { close(); resolve(null); }
    }
    document.addEventListener('keydown', onKey);
    modalHost.onclick = (e) => {
      if (e.target === modalHost && dismissable) { close(); resolve(null); }
    };
  });
}

export function confirmModal(title, body, okLabel = '확인') {
  return modal({
    title, body,
    actions: [
      { label: '취소', value: false },
      { label: okLabel, value: true, primary: true },
    ],
  });
}
