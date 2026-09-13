/* 층 생성. 방을 흩뿌리고 복도로 잇는 고전적인 방식이지만,
   방 종류와 조명 위치까지 여기서 정해 두면 나중에 층 성격을 바꾸기 쉽다. */

import { makeRng, clamp, dist, TAU } from '../core/util.js';
import { isBossFloor } from './enemies.js';

export const TILE = 128;

export const WALL = 0;
export const FLOOR = 1;

export class Level {
  constructor(floor, seed) {
    this.floor = floor;
    this.seed = seed >>> 0;
    const rng = makeRng(this.seed);
    this.rng = rng;
    this.boss = isBossFloor(floor);

    if (this.boss) this.buildArena(rng);
    else this.buildRooms(rng);

    this.buildDetails(rng);
    this.flow = null;
    this.flowDist = new Int32Array(this.w * this.h);
    this.flowTarget = { x: -1, y: -1 };
    this.queue = new Int32Array(this.w * this.h);
  }

  init(w, h) {
    this.w = w; this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.variant = new Uint8Array(w * h);
    this.rooms = [];
    this.props = [];
    this.torches = [];
    this.spawns = [];
    this.chests = [];
    this.shrines = [];
  }

  buildArena(rng) {
    this.init(24, 18);
    const room = { x: 2, y: 2, w: 20, h: 14, kind: 'boss' };
    this.carveRoom(room);
    this.rooms.push(room);
    this.start = this.tileCenter(room.x + 3, room.y + room.h - 3);
    this.exit = this.tileCenter(room.x + room.w - 3, room.y + 2);
    /* 기둥 네 개. 보스의 장판을 피할 곳을 만들어 준다. */
    for (const [dx, dy] of [[5, 4], [16, 4], [5, 12], [16, 12]]) {
      const c = this.tileCenter(room.x + dx - 2, room.y + dy - 2);
      this.props.push({ x: c.x, y: c.y, r: 46, kind: 'pillar', solid: true });
    }
    this.spawns.push({ ...this.tileCenter(room.x + room.w - 4, room.y + 3), boss: true });
  }

  buildRooms(rng) {
    const size = clamp(34 + Math.floor(this.floor * 0.8), 34, 54);
    this.init(size, clamp(24 + Math.floor(this.floor * 0.5), 24, 38));

    const wanted = clamp(5 + Math.floor(this.floor / 2), 5, 9);
    const rooms = [];
    for (let attempt = 0; attempt < 220 && rooms.length < wanted; attempt++) {
      const rw = rng.int(7, 12);
      const rh = rng.int(6, 10);
      const rx = rng.int(2, this.w - rw - 3);
      const ry = rng.int(2, this.h - rh - 3);
      const box = { x: rx, y: ry, w: rw, h: rh };
      const overlaps = rooms.some((o) => (
        rx < o.x + o.w + 3 && rx + rw + 3 > o.x && ry < o.y + o.h + 3 && ry + rh + 3 > o.y
      ));
      if (!overlaps) rooms.push(box);
    }

    /* 첫 방에서 가장 먼 방을 출구로 삼아야 층이 심심하지 않다. */
    rooms.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    for (const r of rooms) this.carveRoom(r);
    for (let i = 1; i < rooms.length; i++) this.carveCorridor(rooms[i - 1], rooms[i], rng);
    if (rooms.length > 3) this.carveCorridor(rooms[0], rooms[rooms.length - 1], rng);

    const start = rooms[0];
    let exit = rooms[1] || rooms[0];
    let best = -1;
    for (const r of rooms) {
      const d = Math.hypot(r.x - start.x, r.y - start.y);
      if (d > best) { best = d; exit = r; }
    }

    start.kind = 'start';
    exit.kind = 'exit';
    const rest = rooms.filter((r) => r !== start && r !== exit);
    if (rest.length) {
      const treasure = rest[rng.int(0, rest.length - 1)];
      treasure.kind = 'treasure';
    }
    for (const r of rooms) if (!r.kind) r.kind = 'combat';
    this.rooms = rooms;

    this.start = this.roomCenter(start);
    this.exit = this.roomCenter(exit);

    for (const r of rooms) {
      if (r.kind === 'start') continue;
      if (r.kind === 'treasure') {
        const c = this.roomCenter(r);
        this.chests.push({ x: c.x, y: c.y, opened: false, r: 34, quality: 1 });
      }
      const area = r.w * r.h;
      const count = clamp(Math.round(area / 16 + this.floor * 0.18), 2, 9);
      for (let i = 0; i < count; i++) {
        const tx = r.x + 1 + rng.int(0, r.w - 3);
        const ty = r.y + 1 + rng.int(0, r.h - 3);
        this.spawns.push({ ...this.tileCenter(tx, ty), elite: false });
      }
      if (r.kind === 'combat' && rng.chance(0.35) && this.floor >= 3) {
        const c = this.roomCenter(r);
        this.spawns.push({ x: c.x, y: c.y, elite: true });
      }
      if (r.kind === 'combat' && rng.chance(0.3)) {
        const c = this.roomCenter(r);
        this.shrines.push({ x: c.x + rng.range(-80, 80), y: c.y + rng.range(-80, 80), used: false, r: 38 });
      }
    }

    /* 기둥과 잔해. 시야를 조금 막아 주면 전투가 단조롭지 않다. */
    for (const r of rooms) {
      if (r.kind === 'start') continue;
      const n = rng.int(0, 3);
      for (let i = 0; i < n; i++) {
        const c = this.tileCenter(r.x + 1 + rng.int(0, r.w - 3), r.y + 1 + rng.int(0, r.h - 3));
        this.props.push({ x: c.x, y: c.y, r: rng.chance(0.5) ? 44 : 30, kind: rng.chance(0.6) ? 'pillar' : 'rubble', solid: true });
      }
    }
  }

  buildDetails(rng) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        this.variant[y * this.w + x] = rng.int(0, 5);
      }
    }
    /* 벽 앞에 횃불을 드문드문 세운다. */
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        if (this.tiles[y * this.w + x] !== WALL) continue;
        if (this.tiles[(y + 1) * this.w + x] !== FLOOR) continue;
        if (!rng.chance(0.085)) continue;
        const c = this.tileCenter(x, y);
        this.torches.push({ x: c.x, y: c.y + TILE * 0.42, phase: rng.range(0, TAU) });
      }
    }
  }

  carveRoom(r) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) this.tiles[y * this.w + x] = FLOOR;
    }
  }

  carveCorridor(a, b, rng) {
    const ax = Math.floor(a.x + a.w / 2), ay = Math.floor(a.y + a.h / 2);
    const bx = Math.floor(b.x + b.w / 2), by = Math.floor(b.y + b.h / 2);
    const horizontalFirst = rng.chance(0.5);
    const wide = (x, y) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx > 0 && ny > 0 && nx < this.w - 1 && ny < this.h - 1) this.tiles[ny * this.w + nx] = FLOOR;
        }
      }
    };
    if (horizontalFirst) {
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) wide(x, ay);
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) wide(bx, y);
    } else {
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) wide(ax, y);
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) wide(x, by);
    }
  }

  tileCenter(tx, ty) {
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }

  roomCenter(r) {
    return { x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE };
  }

  get width() { return this.w * TILE; }
  get height() { return this.h * TILE; }

  tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return WALL;
    return this.tiles[ty * this.w + tx];
  }

  solidAtWorld(x, y) {
    return this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)) === WALL;
  }

  /* 원이 벽을 파고들면 가장 얕게 빠지는 축으로 밀어낸다. */
  resolveCircle(ent, radius) {
    const minX = Math.floor((ent.x - radius) / TILE);
    const maxX = Math.floor((ent.x + radius) / TILE);
    const minY = Math.floor((ent.y - radius) / TILE);
    const maxY = Math.floor((ent.y + radius) / TILE);
    let hit = false;
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (this.tileAt(tx, ty) !== WALL) continue;
        const left = tx * TILE, top = ty * TILE;
        const cx = clamp(ent.x, left, left + TILE);
        const cy = clamp(ent.y, top, top + TILE);
        const dx = ent.x - cx, dy = ent.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= radius * radius) continue;
        hit = true;
        const d = Math.sqrt(d2) || 0.0001;
        if (d2 > 0.0001) {
          const push = radius - d;
          ent.x += (dx / d) * push;
          ent.y += (dy / d) * push;
        } else {
          /* 완전히 안에 갇힌 경우엔 타일 중심에서 밀어낸다. */
          const mx = left + TILE / 2, my = top + TILE / 2;
          const ax = ent.x - mx, ay = ent.y - my;
          if (Math.abs(ax) > Math.abs(ay)) ent.x = ax > 0 ? left + TILE + radius : left - radius;
          else ent.y = ay > 0 ? top + TILE + radius : top - radius;
        }
      }
    }
    for (const p of this.props) {
      if (!p.solid) continue;
      const dx = ent.x - p.x, dy = ent.y - p.y;
      const rr = p.r + radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        ent.x += (dx / d) * (rr - d);
        ent.y += (dy / d) * (rr - d);
        hit = true;
      }
    }
    return hit;
  }

  /* 시야 판정. 벽 너머로는 원거리 공격을 쏘지 않게 한다. */
  lineOfSight(x0, y0, x1, y1) {
    const steps = Math.ceil(dist(x0, y0, x1, y1) / (TILE * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solidAtWorld(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  /* 플레이어까지의 거리장. 적이 벽을 돌아 들어오게 만든다. */
  buildFlow(targetX, targetY) {
    const tx = clamp(Math.floor(targetX / TILE), 0, this.w - 1);
    const ty = clamp(Math.floor(targetY / TILE), 0, this.h - 1);
    if (this.flowTarget.x === tx && this.flowTarget.y === ty) return;
    this.flowTarget = { x: tx, y: ty };

    const d = this.flowDist;
    d.fill(-1);
    const q = this.queue;
    let head = 0, tail = 0;
    const start = ty * this.w + tx;
    if (this.tiles[start] !== FLOOR) return;
    d[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const cur = q[head++];
      const cx = cur % this.w, cy = (cur / this.w) | 0;
      const nd = d[cur] + 1;
      for (let i = 0; i < 4; i++) {
        const nx = cx + (i === 0 ? 1 : i === 1 ? -1 : 0);
        const ny = cy + (i === 2 ? 1 : i === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const ni = ny * this.w + nx;
        if (this.tiles[ni] !== FLOOR || d[ni] !== -1) continue;
        d[ni] = nd;
        q[tail++] = ni;
      }
    }
  }

  flowAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 1 || ty < 1 || tx >= this.w - 1 || ty >= this.h - 1) return null;
    const here = this.flowDist[ty * this.w + tx];
    if (here < 0) return null;
    let bestX = 0, bestY = 0, best = here;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const v = this.flowDist[(ty + dy) * this.w + (tx + dx)];
        if (v < 0) continue;
        /* 대각선은 두 축이 모두 뚫려 있을 때만 쓴다. 벽 모서리에 끼는 걸 막는다. */
        if (dx && dy && (this.tileAt(tx + dx, ty) !== FLOOR || this.tileAt(tx, ty + dy) !== FLOOR)) continue;
        if (v < best) { best = v; bestX = dx; bestY = dy; }
      }
    }
    if (!bestX && !bestY) return null;
    const len = Math.hypot(bestX, bestY);
    return { x: bestX / len, y: bestY / len };
  }

  randomFloorPoint(rng, awayFrom = null, minDist = 0) {
    for (let i = 0; i < 200; i++) {
      const tx = rng.int(1, this.w - 2);
      const ty = rng.int(1, this.h - 2);
      if (this.tileAt(tx, ty) !== FLOOR) continue;
      const c = this.tileCenter(tx, ty);
      if (awayFrom && dist(c.x, c.y, awayFrom.x, awayFrom.y) < minDist) continue;
      return c;
    }
    return { ...this.start };
  }

  /* 좌표가 벽 안이면 가장 가까운 바닥으로 옮긴다. */
  nearestFloor(x, y) {
    if (!this.solidAtWorld(x, y)) return { x, y };
    for (let r = 1; r < 12; r++) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * TAU;
        const nx = x + Math.cos(ang) * r * TILE * 0.7;
        const ny = y + Math.sin(ang) * r * TILE * 0.7;
        if (!this.solidAtWorld(nx, ny)) return { x: nx, y: ny };
      }
    }
    return { ...this.start };
  }
}
