import { randomUUID } from 'node:crypto';
import { LOOT } from '../../src/loot.js';
import { flatDist, moveEntity } from '../../src/sim.js';
import { ITEMS } from '../../src/data.js';
import { countDrops } from '../../src/rates.js';

// Claim removes the entry synchronously, before the server credits its recipient.
// Ownership uses the account key, so reconnecting does not lose the reservation.
export function createGroundLoot() {
  const entries = new Map();
  const expire = (now) => { for (const [id, d] of entries) if (now >= d.expiresAt) entries.delete(id); };
  function spawn(position, reward, owner, ownerName, now = Date.now(), allowed = []) {
    const items = [];
    if (reward.coins > 0) items.push({ item: 'coins', n: Math.floor(reward.coins) });
    for (const stack of countDrops(reward.drops)) if (ITEMS[stack.item]) items.push(stack);
    return items.map((item, i) => {
      const angle = i * 2.39996, pos = { x: position.x, z: position.z, y: position.y || 0 };
      moveEntity(pos, Math.cos(angle), Math.sin(angle), 0.8 + i * 0.32, 0.6);
      const d = { id: randomUUID(), ...item, x: pos.x, y: pos.y, z: pos.z, owner, ownerName, allowed: [...allowed],
        protectedUntil: now + LOOT.protectionMs, expiresAt: now + LOOT.lifetimeMs };
      entries.set(d.id, d); return d;
    });
  }
  function claim(id, actor, account, now = Date.now()) {
    const d = entries.get(id);
    if (!d || now >= d.expiresAt) { entries.delete(id); return { error: 'Добыча уже подобрана или исчезла.' }; }
    if (actor.dead) return { error: 'Мёртвый персонаж не может подбирать добычу.' };
    if (flatDist(actor, d) > LOOT.pickupRange || Math.abs((actor.y || 0) - d.y) > 4) return { error: 'Подойдите ближе к добыче.' };
    if (now < d.protectedUntil && account !== d.owner && !d.allowed?.includes(account)) return { error: `Добыча пока принадлежит ${d.ownerName}.` };
    entries.delete(id);
    return { drop: d };
  }
  function snapshotFor(actor, view, account, now = Date.now()) {
    expire(now);
    return [...entries.values()].filter(d => flatDist(actor, d) < view).map(({ owner, allowed, ...d }) => ({ ...d, available: owner === account || allowed?.includes(account) || now >= d.protectedUntil }));
  }
  return { spawn, claim, snapshotFor, expire, restore: d => entries.set(d.id, d) };
}
