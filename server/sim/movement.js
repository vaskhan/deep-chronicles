// Проверка клиентского движения: общий запас расстояния и непрерывные коллизии.
// Сервер остается владельцем позиции; высота клиента не используется.
import { MAP, DUNGEON, heightAt } from '../../src/world-core.js';

const RADIUS = 0.6;
const CELL = 24;
const EPS = 1e-6;
const JITTER_SECONDS = 0.5;

export function resetMovement(a, now = Date.now()) {
  a.movement = { at: now, credit: 0, fresh: true };
}

export function createMovement(obstacles) {
  const grid = new Map();
  for (const o of obstacles) {
    for (let x = Math.floor((o.x-o.r-RADIUS)/CELL); x <= Math.floor((o.x+o.r+RADIUS)/CELL); x++) {
      for (let z = Math.floor((o.z-o.r-RADIUS)/CELL); z <= Math.floor((o.z+o.r+RADIUS)/CELL); z++) {
        const key = `${x},${z}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(o);
      }
    }
  }
  function nearby(a, b) {
    const found = new Set();
    for (let x = Math.floor(Math.min(a.x,b.x)/CELL); x <= Math.floor(Math.max(a.x,b.x)/CELL); x++) {
      for (let z = Math.floor(Math.min(a.z,b.z)/CELL); z <= Math.floor(Math.max(a.z,b.z)/CELL); z++) {
        for (const o of grid.get(`${x},${z}`) || []) found.add(o);
      }
    }
    return found;
  }
  function inBounds(p) {
    if (p.x < DUNGEON.x0 - 100) return Math.abs(p.x) <= MAP/2-20 && Math.abs(p.z) <= MAP/2-20;
    return p.x >= DUNGEON.x0 && p.x <= DUNGEON.x0+DUNGEON.cell*DUNGEON.n && p.z >= DUNGEON.z0 && p.z <= DUNGEON.z0+DUNGEON.cell*DUNGEON.n;
  }
  // Малый допуск совпадает с округлением сетевых координат, а не с размером шага.
  function clear(a, b) {
    const dx=b.x-a.x, dz=b.z-a.z, length2=dx*dx+dz*dz;
    for (const o of nearby(a,b)) {
      const radius=o.r+RADIUS-0.02;
      const ax=a.x-o.x, az=a.z-o.z;
      // Старое сохранение внутри препятствия может только выходить наружу.
      if (ax*ax+az*az < radius*radius && ax*dx+az*dz >= 0 && (b.x-o.x)**2+(b.z-o.z)**2 > ax*ax+az*az+EPS) continue;
      const t=length2 ? Math.max(0,Math.min(1,-(ax*dx+az*dz)/length2)) : 0;
      if ((ax+dx*t)**2+(az+dz*t)**2 < radius*radius-EPS) return false;
    }
    return true;
  }
  function accept(a, point, speed, now = Date.now()) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || !Number.isFinite(speed) || speed <= 0) return false;
    if (!a.movement) resetMovement(a, now);
    const state=a.movement;
    const elapsed=Math.max(0,now-state.at)/1000;
    state.at=Math.max(state.at,now);
    // Начальный запас выдается один раз, а не на каждый пакет. Скорость 10/25 Гц одинакова.
    state.credit=Math.min(speed*JITTER_SECONDS,(state.fresh ? speed*0.15 : state.credit)+speed*elapsed);
    state.fresh=false;
    const path=point.path === undefined || (Array.isArray(point.path) && point.path.length === 0) ? [point] : point.path;
    if (!Array.isArray(path) || path.length > 64 || path.length === 0) return false;
    let previous=a, distance=0;
    for (const step of path) {
      if (!step || !Number.isFinite(step.x) || !Number.isFinite(step.z)) return false;
      distance+=Math.hypot(step.x-previous.x,step.z-previous.z);
      previous=step;
    }
    if (Math.hypot(previous.x-point.x,previous.z-point.z) > EPS) return false;
    if (distance < EPS) { a.y=heightAt(a.x,a.z); return true; }
    if (a.dead || a.cast || distance > state.credit+EPS) return false;
    previous=a;
    for (const step of path) {
      if (!inBounds(step) || !clear(previous,step)) return false;
      previous=step;
    }
    state.credit=Math.max(0,state.credit-distance);
    a.x=point.x; a.z=point.z; a.y=heightAt(a.x,a.z);
    return true;
  }
  return { accept, clear };
}
