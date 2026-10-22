import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
import { splitCommands, argumentsOf } from '../src/parser.js';
import { compilePattern } from '../src/pattern.js';
function fixture() { const sent=[],notices=[];return { sent,notices,e:new Engine({send:s=>sent.push(s),notice:s=>notices.push(s)}) }; }
test('official kk alias example uses one parameter in two commands',()=>{
 const {e,sent}=fixture();e.execute('#ALIAS kk {kill %1;kick %1}');e.execute('kk rabbit');assert.deepEqual(sent,['kill rabbit','kick rabbit']);
});
test('official parameter-free alias appends trailing input',()=>{
 const {e,sent}=fixture();e.execute('#ALIAS k kill');e.execute('k rabbit');assert.deepEqual(sent,['kill rabbit']);
});
test('unused arguments and remaining argument parameters',()=>{
 const {e,sent}=fixture();e.execute('#ALIAS x {tell %1 %-2}');e.execute('x bob hello world');assert.deepEqual(sent,['tell bob hello world']);
});
test('variables resolve at execution, normal command line stays verbatim',()=>{
 const {e,sent}=fixture();e.execute('#VAR container waterskin;#ALIAS dr {drink @container}');e.execute('#VAR container jug');e.execute('dr');e.execute('chat name@example.com');assert.deepEqual(sent,['drink jug','chat name@example.com']);
});
test('official trigger coin example and class switches',()=>{
 const {e,sent}=fixture();e.execute('#TRIGGER {^You get (%d) coins} {split %1} autosplit');e.receive('You get 123 coins.');e.execute('#T- autosplit');e.receive('You get 456 coins.');e.execute('#T+ autosplit');e.receive('You get 789 coins.');assert.deepEqual(sent,['split 123','split 789']);
});
test('trigger calls alias and resolves variables',()=>{
 const {e,sent}=fixture();e.execute('#VAR container jug;#ALIAS dr {drink @container};#TRIGGER {You are thirsty} {dr}');e.receive('You are thirsty.');assert.deepEqual(sent,['drink jug']);
});
test('prompt and line triggers do not double fire',()=>{
 const {e,sent}=fixture();e.execute('#TRIGGER {Name:} {guest}');e.triggers[0].mode='prompt';e.receive('Name:');assert.deepEqual(sent,[]);e.receive('Name:','prompt');assert.deepEqual(sent,['guest']);
});
test('unknown client commands are never forwarded',()=>{
 const {e,sent}=fixture();assert.throws(()=>e.execute('#EXEC evil'),/尚未支援/);assert.deepEqual(sent,[]);
});
test('alias recursion stops with an actionable error',()=>{
 const {e,sent}=fixture();e.execute('#ALIAS a a');assert.throws(()=>e.execute('a'),/遞迴/);assert.deepEqual(sent,[]);
});
test('quoted and braced command separators are preserved',()=>{
 assert.deepEqual(splitCommands('#ALIAS a {say one;say two};say "a;b"'),['#ALIAS a {say one;say two}','say "a;b"']);
 assert.deepEqual(argumentsOf('make {#ALIAS %1 {cast %1 %%1}}').map(a=>a.value),['make','#ALIAS %1 {cast %1 %%1}']);
});
test('escaped literal metacharacters and ASCII zMUD tokens',()=>{
 assert.ok(compilePattern('^~[test~]$').test('[test]'));assert.ok(compilePattern('^(%w) tells you').test('Zugg tells you hi'));assert.ok(!compilePattern('^(%w)$').test('中文'));assert.ok(compilePattern('^&3$').test('abc'));assert.ok(compilePattern('^{north|south}$').test('south'));assert.ok(!compilePattern('$').test('nonempty'));
});
test('wildcards do not accept client command separators from server text',()=>{
 const {e,sent}=fixture();e.execute('#TRIGGER {^Order: (*)$} {%1}');e.receive('Order: drop all;quit');assert.deepEqual(sent,[]);
});
test('capture interpolation cannot inject extra commands',()=>{
 const {e,sent}=fixture();e.execute('#TRIGGER {^Count: (%d)$} {say %1}');e.receive('Count: 5');assert.deepEqual(sent,['say 5']);
});
test('settings restore validates atomically and preserves configuration',()=>{
 const {e}=fixture();e.execute('#ALIAS k kill');const before=e.snapshot();assert.throws(()=>e.restore({aliases:[{name:'bad space',body:'kill'}]}));assert.deepEqual(e.snapshot(),before);
});
test('variables in trigger patterns expand at match time',()=>{
 const {e,sent}=fixture();e.execute('#VAR target Bob;#TRIGGER {^@target tells you} {say hi}');e.receive('Bob tells you hello');e.execute('#VAR target Alice');e.receive('Bob tells you hello');e.receive('Alice tells you hello');assert.deepEqual(sent,['say hi','say hi']);
});
test('paused automation never fires',()=>{const {e,sent}=fixture();e.execute('#TRIGGER hi {say hi}');e.paused=true;e.receive('hi');assert.deepEqual(sent,[]);});
test('official delayed parameter expansion creates another alias',()=>{
 const {e,sent}=fixture();e.execute('#AL make {#ALIAS %1 {cast %1 %%1}}');e.execute('make heal');e.execute('heal bob');assert.deepEqual(sent,['cast heal bob']);
});
test('IF condition, both branches and math evaluate without JavaScript',()=>{
 const {e,sent}=fixture();e.execute('#VAR hp 20;#IF (@hp < 30) {drink potion} {say healthy}');e.execute('#MATH hp {@hp+50}');e.execute('#IF (@hp < 30) {drink potion} {say healthy}');assert.equal(e.variables.hp,'70');assert.deepEqual(sent,['drink potion','say healthy']);assert.throws(()=>e.execute('#IF (process.exit()) {quit}'));
});
test('forced numeric evaluation and integer division match documentation',()=>{
 const {e}=fixture();e.execute('#VAR a 100;#VAR b 20;#VAR c [@a/@b]');assert.equal(e.variables.c,'5');e.execute('#MATH c {7/2}');assert.equal(e.variables.c,'3');assert.throws(()=>e.execute('#MATH c {1/0}'),/零/);
});
test('quoted string comparisons remain strings',()=>{
 const {e,sent}=fixture();e.execute('#IF ("bob"="bob") {say yes} {say no}');assert.deepEqual(sent,['say yes']);
});
