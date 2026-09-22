import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createParties, PARTY} from '../server/sim/party.js';
import {createGroundLoot} from '../server/sim/loot.js';
import {newActor, newChar} from '../server/sim/player.js';
import {MOBS} from '../src/data.js';
import {spForKill} from '../src/progression.js';
import {xpForKill} from '../src/sim.js';
function setup(count = 3) {
 const players = new Map(), packets = [];
 for(let i=1;i<=count;i++) { const name='Party'+i; const a=newActor(i,name,newChar(name,'warrior'));a.x=-285;a.z=387;a.y=0;
  players.set(i,{id:i,name,key:name.toLowerCase(),a}); }
 const manager=createParties(players,(p,m)=>packets.push({to:p.id,...m}));
 const join=(id,now=10000)=>{manager.command(players.get(1),{action:'invite',name:players.get(id).name},now);manager.command(players.get(id),{action:'accept',from:1},now+1);};
 return {players,packets,manager,join};
}
test('party invitations require acceptance, leader authority, capacity and expiry; disconnect transfers leadership',()=>{
 const {players:p,packets,manager:m,join}=setup(8);
 m.command(p.get(1),{action:'invite',name:'Party2'},10000);
 assert.equal(m.groupOf(2),undefined);
 m.command(p.get(2),{action:'accept',from:1},41000);assert.equal(m.groupOf(2),undefined);
 join(2,42000);join(3,44000);assert.equal(m.groupOf(1).members.size,3);
 m.command(p.get(2),{action:'mode',mode:'pickup'});assert.equal(m.groupOf(1).mode,'random');
 m.command(p.get(2),{action:'invite',name:'Party4'},46000);assert.equal(packets.at(-1).t,'party_err');
 for(let i=4;i<=6;i++)join(i,48000+i*1000);
 join(7,57000);assert.equal(m.groupOf(1).members.size,PARTY.maxMembers);assert.equal(m.groupOf(7),undefined);
 m.remove(p.get(1));assert.equal(m.groupOf(2).leader,2);
 for(let i=3;i<=6;i++)m.remove(p.get(i));assert.equal(m.groupOf(2),undefined);
});
test('party XP and SP are conserved; distant/dead/too low members excluded; level gap applies kill penalty',()=>{
 const {players:p,manager:m,join}=setup(4);join(2);join(3,12000);join(4,14000);
 const mob={x:-285,z:387,def:MOBS.goblin};p.get(3).a.x=1000;p.get(4).a.dead=true;
 const plan=m.rewardPlan(p.get(1),p.get(2),mob,()=>0.99);
 assert.equal(plan.shares.length,2);assert.equal(plan.shares.reduce((n,s)=>n+s.xp,0),xpForKill(MOBS.goblin,1));
 assert.equal(plan.shares.reduce((n,s)=>n+s.sp,0),spForKill(xpForKill(MOBS.goblin,1)));assert.equal(plan.recipient.id,2);
 p.get(2).a.P.lvl=12;const reduced=m.rewardPlan(p.get(1),p.get(2),mob);
 assert.equal(reduced.shares.reduce((n,s)=>n+s.xp,0),xpForKill(MOBS.goblin,12),'награда считается по старшему участнику');
 assert.equal(reduced.shares.length,1,'отставший больше чем на девять уровней не получает ничего');
});
test('last hit and random reserve to one member; pickup reserves to eligible members and claims once even after policy change',()=>{
 const {players:p,manager:m,join}=setup();join(2);const mob={x:-285,z:387,def:MOBS.rabbit};
 m.command(p.get(1),{action:'mode',mode:'last_hit'});assert.equal(m.rewardPlan(p.get(1),p.get(2),mob).recipient.id,2);
 assert.equal(m.rewardPlan(p.get(1),p.get(3),mob).recipient.id,1,'outsider finisher cannot steal winning party reward');
 m.command(p.get(1),{action:'mode',mode:'random'});assert.equal(m.rewardPlan(p.get(1),p.get(2),mob,()=>0).recipient.id,1);
 m.command(p.get(1),{action:'mode',mode:'pickup'});const plan=m.rewardPlan(p.get(1),p.get(2),mob);
 const loot=createGroundLoot();const [drop]=loot.spawn(mob,{coins:6,drops:[]},plan.recipient.key,'party',1000,plan.allowed);
 for(const player of p.values()) {player.a.x=drop.x;player.a.z=drop.z;player.a.y=drop.y;}
 assert.ok(loot.claim(drop.id,p.get(3).a,p.get(3).key,1001).error);
 m.command(p.get(1),{action:'mode',mode:'last_hit'});
 const snapshot=loot.snapshotFor(p.get(1).a,60,p.get(1).key,1001)[0];assert.equal(snapshot.available,true);assert.equal(snapshot.allowed,undefined);
 assert.equal(loot.claim(drop.id,p.get(1).a,p.get(1).key,1002).drop.id,drop.id);
 assert.ok(loot.claim(drop.id,p.get(2).a,p.get(2).key,1002).error);
});
