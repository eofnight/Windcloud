import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../src/engine.js';
import {LineStream} from '../src/telnet.js';
import {CaptureLog} from '../src/capture-log.js';
function fixture() {
  const captured=[],sent=[],notices=[];
  const e=new Engine({capture:data=>captured.push(data),send:text=>sent.push(text),notice:text=>notices.push(text)});
  return {e,captured,sent,notices};
}
test('the exact requested compact CAP syntax records the full matching line',()=>{
  const {e,captured,sent}=fixture();
  e.execute('#cap【系統】連線精靈： system');
  e.receive('【系統】連線精靈：測試玩家重新連線進入。');
  e.receive('你往北走。');
  assert.deepEqual(captured,[{target:'system',line:'【系統】連線精靈：測試玩家重新連線進入。'}]);
  assert.deepEqual(sent,[]);
});
test('braces support spaces and CAP performs literal matching rather than regex execution',()=>{
  const {e,captured}=fixture();e.execute('#CAP {[公告] (活動)} {系統 公告}');
  e.receive('[公告] (活動) 本週開放');e.receive('公告 活動 本週開放');
  assert.deepEqual(captured,[{target:'系統 公告',line:'[公告] (活動) 本週開放'}]);
});
test('each target receives a matching line only once, distinct targets each get a copy',()=>{
  const {e,captured}=fixture();e.execute('#CAP 系統 system;#CAP 精靈 system;#CAP 系統 notices');
  e.receive('系統連線精靈：hello');
  assert.deepEqual(captured.map(c=>c.target),['system','notices']);
});
test('capture waits for newline and strips split ANSI escapes without losing Chinese text',()=>{
  const {e,captured}=fixture();e.execute('#cap【系統】連線精靈： system');
  const stream=new LineStream(line=>e.receive(line),line=>e.receive(line,'prompt'));
  stream.feed('\x1b[1;');stream.feed('36m【系統】連線');stream.flushPrompt();
  assert.equal(captured.length,0);
  stream.feed('精靈：測試玩家\x1b[m\r\n');
  assert.deepEqual(captured,[{target:'system',line:'【系統】連線精靈：測試玩家'}]);
});
test('CAP rules survive save and reload; older settings default to no captures',()=>{
  const {e}=fixture();e.execute('#CAP 系統 system');
  const next=fixture();next.e.restore(JSON.parse(JSON.stringify(e.snapshot())));next.e.receive('系統公告');assert.equal(next.captured.length,1);
  next.e.restore({aliases:[],triggers:[],variables:{},groups:{}});assert.deepEqual(next.e.captures,[]);
});
test('pause, per-rule disable, and group disable stop capture',()=>{
  const {e,captured}=fixture();e.execute('#CAP 系統 system');e.paused=true;e.receive('系統公告');
  e.paused=false;e.captures[0].enabled=false;e.receive('系統公告');
  e.captures[0].enabled=true;e.captures[0].group='news';e.execute('#T- news');e.receive('系統公告');
  e.execute('#T+ news');e.receive('系統公告');assert.equal(captured.length,1);
});
test('redefining CAP does not duplicate it, and UNCAP can target a single tab',()=>{
  const {e,captured}=fixture();e.execute('#CAP 系統 system;#CAP 系統 system;#CAP 系統 news');assert.equal(e.captures.length,2);
  e.execute('#UNCAP 系統 system');e.receive('系統公告');assert.deepEqual(captured.map(c=>c.target),['news']);
  e.execute('#UNCAP 系統');assert.equal(e.captures.length,0);
});
test('invalid CAP input cannot mutate existing rules or reach the server',()=>{
  const {e,sent}=fixture();e.execute('#CAP 系統 system');const state=e.snapshot();
  assert.throws(()=>e.execute('#CAP {} system'));
  assert.throws(()=>e.execute('#CAP 系統 {bad\ttab}'));
  assert.throws(()=>e.execute('#CAP too many args'));
  assert.throws(()=>e.restore({...state,captures:[{text:'系統',target:42}]}));
  assert.deepEqual(e.snapshot(),state);assert.deepEqual(sent,[]);
});
test('captured server text is data, never a script',()=>{
  const {e,captured,sent}=fixture();e.execute('#CAP 系統 system');e.receive('系統：#SEND quit;drop all');assert.equal(captured[0].line,'系統：#SEND quit;drop all');assert.deepEqual(sent,[]);
});
test('capture does not prevent normal triggers on the same line',()=>{
  const {e,captured,sent}=fixture();e.execute('#CAP 系統 system;#TRIGGER 系統 {say hello}');e.receive('系統公告');assert.equal(captured.length,1);assert.deepEqual(sent,['say hello']);
});
test('session records bound memory, track unread, and preserve repeated messages',()=>{
  const log=new CaptureLog({maxLines:2,maxCharacters:20});log.append('one');log.append('one');log.append('three');assert.equal(log.text(),'one\nthree\n');assert.equal(log.unread,3);
  log.read();log.append('four',true);assert.equal(log.unread,0);assert.equal(log.text(),'three\nfour\n');log.clear();assert.equal(log.text(),'');assert.equal(log.unread,0);
});
test('a single long record is truncated without disappearing',()=>{
  const log=new CaptureLog({maxCharacters:10});log.append('123456789012345');assert.equal(log.text(),'789012345\n');assert.equal(log.characters,10);
});
