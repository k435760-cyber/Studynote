/* 설치 안내와 서비스 워커. 인앱 브라우저에서는 설치가 막혀 있어
   바깥 브라우저로 나가는 길을 먼저 보여 준다. */

import { el, icon } from '../ui/ui.js';
import { sfx } from '../core/audio.js';

const DISMISS_KEY = 'aetherfall.install.dismissed';

export const installer = {
  deferred: null,
  card: null,
  env: null,
  onUpdate: null,

  init(host) {
    this.env = detectEnv();
    this.host = host;

    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e;
      this.show();
    });

    addEventListener('appinstalled', () => {
      this.hide();
      this.deferred = null;
    });

    if (!this.env.standalone && (this.env.inApp || this.env.ios)) {
      /* 이 둘은 beforeinstallprompt 가 오지 않는다. 직접 안내한다. */
      setTimeout(() => this.show(), 1400);
    }

    this.registerWorker();
  },

  async registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            this.onUpdate?.();
          }
        });
      });
    } catch (e) {
      /* 설치가 안 돼도 게임 자체는 그대로 돌아간다. */
    }
  },

  dismissedRecently() {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
      return Date.now() - at < 1000 * 60 * 60 * 24 * 3;
    } catch (e) {
      return false;
    }
  },

  show(force = false) {
    if (this.env.standalone) return;
    /* 탐험 중이면 끝난 뒤에 다시 띄운다. */
    if (!force && document.body.dataset.screen === '') {
      setTimeout(() => this.show(force), 5000);
      return;
    }
    if (!force && this.dismissedRecently()) return;
    if (this.card) {
      this.card.hidden = false;
      document.body.classList.add('has-install');
      return;
    }

    const card = el('div', { class: 'install-card' });
    card.innerHTML = this.markup();
    this.host.appendChild(card);
    this.card = card;

    card.querySelector('[data-close]')?.addEventListener('click', () => {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* 무시 */ }
      this.hide();
      sfx('uiBack');
    });
    card.querySelector('[data-install]')?.addEventListener('click', () => this.prompt());
    card.querySelector('[data-external]')?.addEventListener('click', () => this.openExternal());
    card.querySelector('[data-copy]')?.addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(location.href);
        e.target.textContent = '주소를 복사했습니다';
      } catch (err) {
        e.target.textContent = '주소를 직접 복사해 주세요';
      }
    });
    document.body.classList.add('has-install');
    /* 카드 높이는 문구에 따라 달라진다. 화면 아래 여백을 그만큼 잡아 준다. */
    requestAnimationFrame(() => {
      document.body.style.setProperty('--install-h', `${card.offsetHeight}px`);
      card.classList.add('install-card--in');
    });
  },

  markup() {
    const e = this.env;
    let body, actions;
    if (e.inApp) {
      body = `${e.appName} 안의 브라우저에서는 설치와 구글 로그인이 막혀 있습니다. 아래 단추로 바깥 브라우저에서 열어 주세요.`;
      actions = `
        <button class="btn btn--primary" data-external type="button">바깥 브라우저로 열기</button>
        <button class="btn" data-copy type="button">주소 복사</button>`;
    } else if (e.ios) {
      body = '사파리 <b>공유</b> → <b>홈 화면에 추가</b>를 누르면 앱처럼 전체 화면으로 켜집니다.';
      actions = '<button class="btn" data-close type="button">나중에</button>';
    } else {
      body = '설치하면 주소창 없이 전체 화면으로 켜지고, 접속이 끊겨도 바로 실행됩니다.';
      actions = `
        <button class="btn btn--primary" data-install type="button">설치하기</button>
        <button class="btn" data-close type="button">나중에</button>`;
    }
    return `
      <div class="install-card__icon">${icon('download')}</div>
      <div class="install-card__body">
        <b>Aetherfall 설치</b>
        <p>${body}</p>
      </div>
      <div class="install-card__actions">${actions}</div>
      <button class="install-card__x" data-close type="button" aria-label="닫기">${icon('close')}</button>
    `;
  },

  hide() {
    if (!this.card) return;
    document.body.classList.remove('has-install');
    this.card.classList.remove('install-card--in');
    setTimeout(() => { if (this.card) this.card.hidden = true; }, 300);
  },

  async prompt() {
    if (!this.deferred) {
      this.show(true);
      return false;
    }
    this.deferred.prompt();
    const res = await this.deferred.userChoice;
    this.deferred = null;
    if (res.outcome === 'accepted') this.hide();
    return res.outcome === 'accepted';
  },

  openExternal() {
    const url = location.href;
    const e = this.env;
    if (e.kakao) {
      location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
      return;
    }
    if (e.android) {
      const clean = url.replace(/^https?:\/\//, '');
      location.href = `intent://${clean}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }
    window.open(url, '_blank', 'noopener');
  },
};

export function detectEnv() {
  const ua = navigator.userAgent || '';
  const standalone = matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;

  const kakao = /KAKAOTALK/i.test(ua);
  const apps = [
    { re: /KAKAOTALK/i, name: '카카오톡' },
    { re: /NAVER\(inapp/i, name: '네이버 앱' },
    { re: /Instagram/i, name: '인스타그램' },
    { re: /FBAN|FBAV|FB_IAB/i, name: '페이스북' },
    { re: /Line\//i, name: '라인' },
    { re: /DaumApps/i, name: '다음 앱' },
    { re: /everytimeapp/i, name: '에브리타임' },
    { re: /BAND\//i, name: '밴드' },
    { re: /Threads/i, name: '스레드' },
    { re: /TikTok/i, name: '틱톡' },
  ];
  const hit = apps.find((a) => a.re.test(ua));

  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const chromium = /Chrome|Chromium|Edg\//i.test(ua) && !hit;

  return {
    standalone,
    inApp: !!hit,
    appName: hit ? hit.name : '',
    kakao,
    ios: ios && !hit,
    android,
    chromium,
    ua,
  };
}
