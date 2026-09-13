import { clamp, damp, rand } from '../core/util.js';
import { settings } from '../core/settings.js';

/* 세로로 보이는 월드 높이. 화면 해상도가 달라도 이 값은 고정이라
   QHD 든 720p 든 보이는 범위가 같다. */
export const VIEW_HEIGHT = 880;

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.zoom = 1;
    this.zoomTarget = 1;
    this.trauma = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.viewW = 1920; this.viewH = VIEW_HEIGHT;
    this.bounds = null;
    this.seed = rand(0, 1000);
  }

  resize(pixelW, pixelH) {
    this.scale = pixelH / VIEW_HEIGHT;
    this.viewH = VIEW_HEIGHT;
    this.viewW = pixelW / this.scale;
  }

  snapTo(x, y) {
    this.x = x; this.y = y;
  }

  shake(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /* 이동 방향을 조금 앞서 본다. 앞이 보여야 다가오는 적에 반응할 수 있다. */
  follow(target, dt, lead = 0.18) {
    const tx = target.x + (target.vx || 0) * lead;
    const ty = target.y + (target.vy || 0) * lead;
    this.x = damp(this.x, tx, 0.09, dt);
    this.y = damp(this.y, ty, 0.09, dt);

    if (this.bounds) {
      const halfW = this.viewW / 2 / this.zoom;
      const halfH = this.viewH / 2 / this.zoom;
      const b = this.bounds;
      if (b.w > halfW * 2) this.x = clamp(this.x, b.x + halfW, b.x + b.w - halfW);
      else this.x = b.x + b.w / 2;
      if (b.h > halfH * 2) this.y = clamp(this.y, b.y + halfH, b.y + b.h - halfH);
      else this.y = b.y + b.h / 2;
    }

    this.zoom = damp(this.zoom, this.zoomTarget, 0.14, dt);

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const t = this.trauma * this.trauma * settings.shake;
    if (t > 0.0001) {
      const time = performance.now() / 1000;
      this.shakeX = (Math.sin(time * 47 + this.seed) + Math.sin(time * 31.3)) * 22 * t;
      this.shakeY = (Math.cos(time * 41.7 + this.seed) + Math.sin(time * 27.1)) * 22 * t;
    } else {
      this.shakeX = 0; this.shakeY = 0;
    }
  }

  apply(ctx, pixelW, pixelH) {
    const s = this.scale * this.zoom;
    ctx.setTransform(s, 0, 0, s,
      pixelW / 2 - (this.x + this.shakeX) * s,
      pixelH / 2 - (this.y + this.shakeY) * s);
  }

  worldToScreen(wx, wy, pixelW, pixelH) {
    const s = this.scale * this.zoom;
    return {
      x: (wx - this.x - this.shakeX) * s + pixelW / 2,
      y: (wy - this.y - this.shakeY) * s + pixelH / 2,
    };
  }

  screenToWorld(sx, sy, pixelW, pixelH) {
    const s = this.scale * this.zoom;
    return {
      x: (sx - pixelW / 2) / s + this.x + this.shakeX,
      y: (sy - pixelH / 2) / s + this.y + this.shakeY,
    };
  }

  /* 화면 밖 객체를 그리지 않으려고 쓰는 사각형. margin 은 월드 단위. */
  viewRect(margin = 160) {
    const halfW = this.viewW / 2 / this.zoom + margin;
    const halfH = this.viewH / 2 / this.zoom + margin;
    return { x: this.x - halfW, y: this.y - halfH, w: halfW * 2, h: halfH * 2 };
  }
}
