import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
import { normalizePreferences } from '../src/preferences.js';
const rule = (name = '補血', body = 'look', mode = 'repeat', seconds = 1) => ({ name, body, mode, seconds });
function fixture(t, timers = [rule()]) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const sent = [], notices = [], echoes = [];
  let connected = true;
  const e = new Engine({ send: s => sent.push(s), notice: s => notices.push(s), echo: (s,n) => echoes.push([s,n]), canStartTimers: () => connected });
  e.restore({ timers });
  t.after(() => { e.timers.stopAll(); e.cancelPending(); });
  return { e, sent, notices, echoes, tick: ms => t.mock.timers.tick(ms), disconnect: () => { connected = false; e.timers.stopAll(); e.cancelPending(); } };
}
test('single shot fires once and runtime state is not serialized', t => {
  const {e,sent,tick} = fixture(t,[rule('one','look','once')]);
  e.execute('#TI+ one'); assert.equal(e.timers.state()[0].dueAt,2000);
  assert.deepEqual(e.snapshot().timers,[rule('one','look','once')]);
  tick(999); assert.deepEqual(sent,[]); tick(1); assert.deepEqual(sent,['look']);
  tick(5000); assert.deepEqual(sent,['look']); assert.equal(e.timers.state()[0].running,false);
});
test('repeat, idempotent start, stop and fresh restart', t => {
  const {e,sent,tick} = fixture(t);
  e.execute('#ti+'); tick(500); e.execute('#ti+'); tick(500); assert.equal(sent.length,1);
  tick(1000); assert.equal(sent.length,2); e.execute('#ti-'); tick(1000); assert.equal(sent.length,2);
  e.execute('#ti+'); tick(999); assert.equal(sent.length,2); tick(1); assert.equal(sent.length,3);
});
test('three independent timers, named controls, braces and case folding', t => {
  const {e,sent,tick} = fixture(t,[rule('喝水 timer','drink'),rule('B','score','once',2),rule('C','hp','once',3)]);
  e.execute('#ti+'); e.execute('#ti- {喝水 TIMER}'); tick(2000); assert.deepEqual(sent,['score']);
  tick(1000); assert.deepEqual(sent,['score','hp']);
  assert.throws(()=>e.execute('#ti+ missing'),/找不到/);
  assert.throws(()=>e.execute('#ti+ B extra'),/格式/);
});
test('timer definitions validate atomically and accept old settings', t => {
  const {e}=fixture(t);
  for(const timers of [[rule(),rule(),rule(),rule()], [rule('A'),rule('a')], [rule('')], [rule('a',' ')], [rule('a','look','wrong')], ...[0,-1,1.2,2147484].map(n=>[rule('a','look','once',n)])]) {
    assert.throws(()=>e.restore({timers})); assert.equal(e.snapshot().timers[0].name,'補血');
  }
  e.restore({}); assert.deepEqual(e.snapshot().timers,[]);
});
test('timer script expands aliases, variables and conditions with automatic echo', t => {
  const {e,sent,echoes,tick}=fixture(t,[rule('a','#MATH hp {@hp+1};#IF (@hp > 1) {dr};score','once')]);
  e.execute('#VAR hp 1;#VAR bottle flask;#ALIAS dr {drink @bottle};#ti+'); tick(1000);
  assert.deepEqual(sent,['drink flask','score']); assert.deepEqual(echoes,[['drink flask','a'],['score','a']]);
});
test('stopping single-shot timer cancels its outstanding WAIT', t => {
  const {e,sent,tick}=fixture(t,[rule('a','#WA 1000;look','once')]);
  e.execute('#ti+'); tick(1000); assert.ok(e.pendingWait); e.execute('#ti- a'); tick(1000); assert.deepEqual(sent,[]);
});
test('WAIT uses existing shared queue and errors stop only their timer', t => {
  const {e,sent,notices,tick}=fixture(t,[rule('bad','#WA 10;#UNKNOWN'),rule('good','look')]);
  e.execute('#ti+'); tick(1000); e.execute('#WA 5;manual'); tick(5); assert.deepEqual(sent,['look','manual']);
  tick(995); tick(10); assert.equal(notices.length,1); assert.match(notices[0],/bad/);
  assert.equal(e.timers.state()[0].running,false); assert.equal(e.timers.state()[1].running,true);
});
test('immediate errors stop timer without preventing other schedules', t => {
  const {e,sent,notices,tick}=fixture(t,[rule('bad','#UNKNOWN'),rule('good','look')]);
  e.execute('#ti+'); tick(1000); assert.deepEqual(sent,['look']); assert.match(notices[0],/bad/);
  assert.equal(e.timers.state()[0].running,false);
});
test('disconnect and restoration stop schedules and require manual start', t => {
  const {e,sent,tick,disconnect}=fixture(t);
  e.execute('#ti+'); disconnect(); tick(1000); assert.deepEqual(sent,[]);
  assert.throws(()=>e.execute('#ti+'),/先連線/);
  const restored=new Engine(); restored.restore(e.snapshot()); assert.equal(restored.timers.state()[0].running,false);
});
test('changing unrelated rules preserves countdown and timer WAIT; editing stops only affected timer', t => {
  const {e,sent,tick}=fixture(t,[rule('a','#WA 500;look','once'),rule('b','score','repeat',3)]);
  e.execute('#ti+'); tick(1000);
  const next=e.snapshot(); next.variables.test='ok'; e.restore(next,{preserveTimers:true});
  tick(500); assert.deepEqual(sent,['look']);
  const edited=e.snapshot(); edited.timers[1].seconds=4; e.restore(edited,{preserveTimers:true});
  tick(5000); assert.deepEqual(sent,['look']);
});
test('trigger pause does not pause timer or cancel its WAIT', t => {
  const {e,sent,tick}=fixture(t,[rule('a','#WA;look','once')]);
  e.execute('#ti+'); tick(1000); e.paused=true; e.receive('prompt'); assert.deepEqual(sent,['look']);
});
test('sleep-sized clock jump fires once rather than replaying missed intervals', t => {
  const {e,sent,tick}=fixture(t); e.execute('#ti+'); tick(100000);
  assert.deepEqual(sent,['look']); assert.equal(e.timers.state()[0].dueAt,102000);
});
test('display defaults off and remains independent of engine state', () => {
  assert.equal(normalizePreferences().showTimers,false);
  assert.equal(normalizePreferences({showTimers:true}).showTimers,true);
  assert.throws(()=>normalizePreferences({showTimers:'yes'}));
});
test('an invalid edit leaves an active schedule intact; unrelated edits keep its original deadline', t => {
  const {e,sent,tick}=fixture(t); e.execute('#ti+'); tick(500);
  assert.throws(()=>e.restore({timers:[rule('bad','look','repeat',0)]},{preserveTimers:true}));
  const next=e.snapshot(); next.variables.hp='10'; e.restore(next,{preserveTimers:true});
  tick(500); assert.deepEqual(sent,['look']);
});
test('full restore cancels active timer and its continuation without restarting', t => {
  const {e,sent,tick}=fixture(t,[rule('a','#WA 1000;look')]);
  e.execute('#ti+'); tick(1000); e.restore(e.snapshot()); tick(3000);
  assert.deepEqual(sent,[]); assert.equal(e.pendingWait,null); assert.equal(e.timers.state()[0].running,false);
});
