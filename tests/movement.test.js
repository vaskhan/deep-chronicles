import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMovement, resetMovement } from '../server/sim/movement.js';
import { heightAt } from '../src/world-core.js';
const actor = (x=0,z=0) => { const a={x,z,dead:false,cast:null}; resetMovement(a,0); return a; };

test('частота пакетов не увеличивает доступную дистанцию', () => {
  for (const hz of [10,25,100]) {
    const a=actor(), m=createMovement([]);
    for(let i=1;i<=hz*5;i++) assert.equal(m.accept(a,{x:i*10/hz,z:0},10,i*1000/hz),true);
    const limit=a.x+a.movement.credit;
    assert.ok(Math.abs(limit-51.5)<1e-6);
    assert.equal(m.accept(a,{x:limit+0.01,z:0},10,5000),false);
  }
});
test('пачка пакетов расходует один запас; простой ограничен половиной секунды', () => {
  const a=actor(),m=createMovement([]);
  assert.equal(m.accept(a,{x:5,z:0},10,10000),true);
  for(let i=0;i<20;i++) assert.equal(m.accept(a,{x:5.1,z:0},10,10000),false);
  assert.equal(m.accept(a,{x:6,z:0},10,10100),true);
});
test('диагональ и обратный путь оплачиваются полной длиной', () => {
  const a=actor(),m=createMovement([]);
  assert.equal(m.accept(a,{x:4,z:4},10,500),false);
  assert.equal(m.accept(a,{x:0,z:0,path:[{x:3,z:0},{x:0,z:0}]},10,500),false);
  assert.equal(a.x,0);
});
test('проверяется весь отрезок, даже если конец находится за препятствием', () => {
  const a=actor(-3),m=createMovement([{x:0,z:0,r:1}]);
  assert.equal(m.accept(a,{x:3,z:0},20,500),false);
  assert.equal(a.x,-3);
});
test('обход по промежуточным шагам разрешен, срезание угла запрещено', () => {
  const a=actor(-2,0),m=createMovement([{x:0,z:0,r:1.4}]);
  assert.equal(m.accept(a,{x:0,z:2},20,500),false);
  const path=Array.from({length:16},(_,i)=>{ const t=Math.PI-(i+1)*Math.PI/32;return {x:2*Math.cos(t),z:2*Math.sin(t)};});
  assert.equal(m.accept(a,{...path.at(-1),path},20,500),true);
});
test('индекс учитывает радиус игрока у границы ячейки', () => {
  const m=createMovement([{x:23.5,z:0,r:.1}]);
  assert.equal(m.clear({x:24.1,z:-1},{x:24.1,z:1}),false);
});
test('старое сохранение внутри препятствия позволяет только выход наружу', () => {
  const m=createMovement([{x:0,z:0,r:2}]);
  assert.equal(m.clear({x:1,z:0},{x:3,z:0}),true);
  assert.equal(m.clear({x:1,z:0},{x:-3,z:0}),false);
});
test('невалидный путь отклоняется целиком, без частичного переноса', () => {
  const m=createMovement([]);
  for(const path of [null,{},[{x:1,z:NaN}],[{x:1,z:0}],Array(65).fill({x:2,z:0}),[{x:1e9,z:1e9},{x:2,z:0}]]) {
    const a=actor();assert.equal(m.accept(a,{x:2,z:0,path},10,500),false);assert.equal(a.x,0);
  }
});
test('смерть, каст и границы мира блокируют движение', () => {
  const m=createMovement([]);
  for(const status of [{dead:true},{cast:{}}]) {
    const a=Object.assign(actor(),status);assert.equal(m.accept(a,{x:1,z:0},10,500),false);
    assert.equal(m.accept(a,{x:0,z:0},10,500),true);
  }
  const a=actor(779);assert.equal(m.accept(a,{x:781,z:0},10,500),false);
});
test('перенос сбрасывает старый запас; высота задается сервером', () => {
  const a=actor(),m=createMovement([]);
  m.accept(a,{x:0,z:0},10,5000);
  a.x=100;resetMovement(a,5000);
  assert.equal(m.accept(a,{x:104,z:0},10,5000),false);
  assert.equal(m.accept(a,{x:101,z:0,y:10000},10,5000),true);
  assert.equal(a.y,heightAt(101,0));
});
test('замедление ограничивает накопленный запас новой скоростью', () => {
  const a=actor(),m=createMovement([]);
  m.accept(a,{x:0,z:0},30,500);
  assert.equal(m.accept(a,{x:6,z:0},10,500),false);
  assert.equal(m.accept(a,{x:5,z:0},10,500),true);
});

import {calcStats} from '../src/stats.js';
import {newChar} from '../server/sim/player.js';
import {MOB_SPEED} from '../src/sim.js';
test('масштаб скорости согласован для классов, мобов, баффов и перегруза',()=>{
  for(const cls of ['warrior','mage']){
    const p=newChar('Тест',cls), speed=calcStats(p).speed;
    assert.ok(Math.abs(speed-({warrior:7.15,mage:6.3624}[cls]))<1e-8,cls+' получает прибавку темпа 10%');
    assert.equal(calcStats(p,[{stat:'speed',mul:1.25,until:100}],0).speed,speed*1.25);
    p.inv=[{id:'potion_hp',n:10000}];
    assert.ok(Math.abs(calcStats(p).speed-speed*.6)<1e-8);
  }
  assert.ok(Math.abs(MOB_SPEED({})-3.3)<1e-8);
  assert.ok(Math.abs(MOB_SPEED({boss:true})-2.64)<1e-8);
});
