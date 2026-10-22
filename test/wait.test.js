import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sent = [], notices = [], changes = [];
  const e = new Engine({ send: text => sent.push(text), notice: text => notices.push(text), changed: () => changes.push(e.snapshot()) });
  t.after(() => e.cancelPending());
  return { e, sent, notices, changes, tick: ms => t.mock.timers.tick(ms) };
}
test('requested #wa 1000;pp waits exactly one second before sending pp', t => {
  const { e, sent, tick } = fixture(t);
  e.execute('#wa 1000;pp'); assert.deepEqual(sent, []);
  tick(999); assert.deepEqual(sent, []);
  tick(1); assert.deepEqual(sent, ['pp']); assert.equal(e.pendingWait, null);
});
test('trigger body supports multiple waits and continuous semicolon commands', t => {
  const { e, sent, tick } = fixture(t);
  e.execute('#TRIGGER {ready} {look;#WA 1000;pp;#WAIT 500;score}'); e.receive('ready');
  assert.deepEqual(sent, ['look']); tick(1000); assert.deepEqual(sent, ['look', 'pp']);
  tick(499); assert.deepEqual(sent, ['look', 'pp']); tick(1); assert.deepEqual(sent, ['look', 'pp', 'score']);
});
test('nested aliases and IF branches finish waiting before the outer sequence continues', t => {
  const { e, sent, tick } = fixture(t);
  e.execute('#ALIAS delayed {#IF (1) {#WA 1000;tell %1 done};look}');
  e.execute('delayed Bob;score'); e.execute('inventory'); assert.deepEqual(sent, ['inventory']);
  tick(1000); assert.deepEqual(sent, ['inventory', 'tell Bob done', 'look', 'score']);
});
test('a newer WAIT cancels the entire previous suspended sequence', t => {
  const { e, sent, tick } = fixture(t);
  e.execute('#ALIAS old {#WA 1000;old-inner}'); e.execute('old;old-outer');
  tick(500); e.execute('#WA 1000;new'); tick(500); assert.deepEqual(sent, []);
  tick(500); assert.deepEqual(sent, ['new']); tick(1000); assert.deepEqual(sent, ['new']);
});
test('repeated trigger waits replace the prior queue while unrelated input remains usable', t => {
  const { e, sent, tick } = fixture(t);
  e.execute('#TRIGGER {^Ready (%d)$} {#WA 1000;say %1}');
  e.receive('Ready 1'); tick(500); e.receive('Ready 2'); e.execute('look');
  tick(500); assert.deepEqual(sent, ['look']); tick(500); assert.deepEqual(sent, ['look', 'say 2']);
});
test('WAIT without a duration resumes on the next server line or prompt', t => {
  const { e, sent, tick } = fixture(t);
  e.execute('#WA;pp'); tick(10000); e.execute('look'); assert.deepEqual(sent, ['look']);
  e.receive('HP: ', 'prompt'); assert.deepEqual(sent, ['look', 'pp']);
  e.execute('#WAIT;score'); e.receive('hello'); assert.deepEqual(sent, ['look', 'pp', 'score']);
});
test('invalid durations stop the sequence and never reach the server', t => {
  const { e, sent } = fixture(t);
  for (const value of ['-1', '1.5', 'Infinity', 'abc', '2147483648', '999999999999999999', '1000 extra']) {
    assert.throws(() => e.execute('#WA ' + value + ';pp'), /等待時間|格式/);
    assert.equal(e.pendingWait, null);
  }
  assert.deepEqual(sent, []);
});
test('duration variables and captures expand correctly without splitting injected separators', t => {
  const { e, sent, tick } = fixture(t);
  e.execute('#VAR delay 1000;#TRIGGER {^Ready (%d)$} {#WA @delay;pp %1;say "a;b"}');
  e.receive('Ready 42'); tick(1000); assert.deepEqual(sent, ['pp 42', 'say "a;b"']);
  e.receive('Ready 42;quit'); tick(1000); assert.deepEqual(sent, ['pp 42', 'say "a;b"']);
});
test('disconnect cancellation, pause and replacing settings discard pending commands', t => {
  const { e, sent, tick } = fixture(t);
  e.execute('#WA 1000;old'); e.cancelPending(); tick(1000);
  e.execute('#WA 1000;old'); e.paused = true; e.paused = false; tick(1000);
  e.execute('#WA 1000;old'); e.restore(e.snapshot()); tick(1000);
  assert.deepEqual(sent, []); assert.equal(e.pendingWait, null);
});
test('delayed errors are reported locally and prevent subsequent commands', t => {
  const { e, sent, notices, tick } = fixture(t);
  e.execute('#WA 1000;#UNKNOWN;pp'); tick(1000);
  assert.deepEqual(sent, []); assert.match(notices[0], /延遲指令錯誤.*尚未支援/); assert.equal(e.pendingWait, null);
});
test('execution limits persist across waits and unrelated manual commands', t => {
  const { e, sent, notices, tick } = fixture(t);
  e.execute(Array(199).fill('#SHOW tick').join(';') + ';#WA 1000;pp');
  e.execute('look'); tick(1000);
  assert.deepEqual(sent, ['look']); assert.match(notices.at(-1), /200 個指令/);
});
test('delayed variable changes invoke persistence and pending waits are never saved', t => {
  const { e, changes, tick } = fixture(t);
  e.execute('#WA 1000;#VAR hp 20'); assert.ok(!Object.hasOwn(e.snapshot(), 'pendingWait'));
  tick(1000); assert.equal(e.variables.hp, '20'); assert.equal(changes.length, 1); assert.equal(changes[0].variables.hp, '20');
});
test('zero milliseconds still defers the remaining commands and keeps their order', t => {
  const { e, sent, tick } = fixture(t);
  e.execute('look;#WA 0;pp;score'); assert.deepEqual(sent, ['look']);
  tick(0); assert.deepEqual(sent, ['look', 'pp', 'score']);
});
