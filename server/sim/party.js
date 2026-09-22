// Session parties; no authority, membership or reward recipient comes from the client.
import { flatDist, xpForKill } from '../../src/sim.js';
import { spForKill } from '../../src/progression.js';
import { DEFAULT_RATES, rateXp, rateSp, partyMultiplier } from '../../src/rates.js';
export const PARTY = Object.freeze({ maxMembers: 6, rewardRange: 60, inviteMs: 30000 });
export const LOOT_MODES = ['random', 'last_hit', 'pickup'];
export function createParties(players, send, rates = DEFAULT_RATES) {
  const groups = new Map(), membership = new Map(), invitations = new Map();
  let seq = 0;
  const groupOf = id => groups.get(membership.get(id));
  const memberPlayers = group => group ? [...group.members].map(id => players.get(id)).filter(p => p?.key && p.a) : [];
  const error = (p, reason) => send(p, { t: 'party_err', reason });
  function snapshot(p) {
    const g = groupOf(p.id);
    if (!g) return { t: 'party', id: null, members: [] };
    return { t: 'party', id: g.id, leader: g.leader, mode: g.mode, range: PARTY.rewardRange,
      members: memberPlayers(g).map(q => ({ id: q.id, name: q.name, cls: q.a.P.cls, lvl: q.a.P.lvl,
        hp: Math.round(q.a.P.hp), maxHp: q.a.partyMaxHp || q.a.P.hp, dead: q.a.dead,
        distance: Math.round(flatDist(p.a, q.a)) })) };
  }
  function notify(g) { for (const p of memberPlayers(g)) send(p, snapshot(p)); }
  function remove(p) {
    invitations.delete(p.id);
    for (const [id, invite] of invitations) if (invite.from === p.id) invitations.delete(id);
    const g = groupOf(p.id); if (!g) return;
    membership.delete(p.id); g.members.delete(p.id); send(p, snapshot(p));
    if (g.members.size < 2) {
      for (const id of g.members) { membership.delete(id); const q = players.get(id); if (q) send(q, snapshot(q)); }
      groups.delete(g.id);
    } else { if (g.leader === p.id) g.leader = g.members.values().next().value; notify(g); }
  }
  function command(p, m, now = Date.now()) {
    const g = groupOf(p.id);
    if (m.action === 'invite') {
      if (now - (p.partyInviteAt || 0) < 1000) return error(p, 'Подождите перед следующим приглашением.');
      p.partyInviteAt = now;
      if (g && g.leader !== p.id) return error(p, 'Приглашать может только лидер.');
      if (g && g.members.size >= PARTY.maxMembers) return error(p, 'В группе уже шесть участников.');
      const q = [...players.values()].find(q => q.key && q.name?.toLowerCase() === String(m.name || '').trim().toLowerCase());
      if (!q || q === p) return error(p, 'Игрок не найден или это ваш персонаж.');
      if (groupOf(q.id)) return error(p, 'Игрок уже в группе.');
      if (invitations.get(q.id)?.expires > now) return error(p, 'Игрок уже рассматривает приглашение.');
      invitations.set(q.id, { from: p.id, group: g?.id || null, expires: now + PARTY.inviteMs });
      send(q, { t: 'party_invite', from: p.id, name: p.name, expires: now + PARTY.inviteMs, mode: g?.mode || 'random' });
      send(p, { t: 'party_notice', text: `Приглашение отправлено: ${q.name}` }); return;
    }
    if (m.action === 'accept' || m.action === 'decline') {
      const invite = invitations.get(p.id); invitations.delete(p.id);
      if (!invite || invite.expires <= now || invite.from !== Number(m.from)) return error(p, 'Приглашение истекло.');
      const leader = players.get(invite.from);
      if (m.action === 'decline') { if (leader) send(leader, { t: 'party_notice', text: `${p.name} отклонил приглашение.` }); return; }
      if (!leader?.key || g) return error(p, 'Приглашение больше не действует.');
      let target = groupOf(leader.id);
      if ((invite.group && target?.id !== invite.group) || (target && target.leader !== leader.id)) return error(p, 'Состав группы изменился. Попросите новое приглашение.');
      if (target?.members.size >= PARTY.maxMembers) return error(p, 'Группа заполнена.');
      if (!target) {
        target = { id: ++seq, leader: leader.id, mode: 'random', members: new Set([leader.id]) };
        groups.set(target.id, target); membership.set(leader.id, target.id);
      }
      target.members.add(p.id); membership.set(p.id, target.id); notify(target); return;
    }
    if (m.action === 'leave') return remove(p);
    if (!g) return error(p, 'Вы не в группе.');
    if (g.leader !== p.id) return error(p, 'Это действие доступно только лидеру.');
    if (m.action === 'mode') {
      if (!LOOT_MODES.includes(m.mode)) return error(p, 'Неизвестный режим добычи.');
      g.mode = m.mode; notify(g); return;
    }
    if (m.action === 'kick') {
      const q = players.get(Number(m.id));
      if (q && q !== p && g.members.has(q.id)) remove(q);
    }
  }
  function rewardPlan(winner, finisher, mob, rng = Math.random) {
    const g = groupOf(winner.id);
    const nearby = memberPlayers(g).filter(p => !p.a.dead && flatDist(p.a, mob) <= PARTY.rewardRange);
    // Solo rules stay unchanged; parties cannot receive rewards remotely or dead.
    const eligible = g ? nearby : [winner];
    if (!eligible.length) return { shares: [], recipient: winner, allowed: [], mode: 'last_hit' };
    // Рейты и бонус группы применяются ДО дележа: суммы остаются целыми и сходятся с наградой.
    const base = xpForKill(mob.def, Math.max(...eligible.map(p => p.a.P.lvl))), bonus = partyMultiplier(eligible.length, rates);
    const xp = rateXp(base * bonus, rates), sp = rateSp(spForKill(base) * bonus, rates);
    const shares = eligible.map((p, i) => ({ player: p, xp: Math.floor(xp / eligible.length) + (i < xp % eligible.length ? 1 : 0),
      sp: Math.floor(sp / eligible.length) + (i < sp % eligible.length ? 1 : 0) }));
    const mode = g?.mode || 'last_hit';
    const recipient = mode === 'random' ? eligible[Math.min(eligible.length-1, Math.floor(rng()*eligible.length))]
      : eligible.find(p => p === finisher) || eligible.find(p => p === winner) || eligible[0];
    return { shares, recipient, mode, allowed: mode === 'pickup' ? eligible.map(p => p.key) : [] };
  }
  function tick(now = Date.now()) {
    for (const [id, invite] of invitations) if (invite.expires <= now) invitations.delete(id);
    for (const g of groups.values()) notify(g);
  }
  return { command, remove, snapshot, groupOf, rewardPlan, tick };
}
