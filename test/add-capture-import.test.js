import test from 'node:test';
import assert from 'node:assert/strict';
import iconv from 'iconv-lite';
import { Engine } from '../src/engine.js';
import { compilePattern } from '../src/pattern.js';
import { importScript } from '../src/import-settings.js';
import { LEGACY_HEADER } from '../src/legacy-mud.js';
function fixture() {const sent=[],captured=[];const e=new Engine({send:s=>sent.push(s),capture:c=>captured.push(c)});return {e,sent,captured};}
test('requested experience and kill counters accumulate numeric captures including trailing space',()=>{
 const {e,sent}=fixture();e.execute('#TRIGGER {你得到 (%d )點實戰經驗。} {#add combat_exp %1;#add kill_mob 1}');
 e.receive('你得到 123 點實戰經驗。');e.receive('你得到 7 點實戰經驗。');
 assert.equal(e.variables.combat_exp,'130');assert.equal(e.variables.kill_mob,'2');assert.deepEqual(sent,[]);
});
test('requested double-capture pattern increments zero potential and one score independently',()=>{
 const {e,sent}=fixture();e.execute('#TRIGGER {你得到 (%d) 點潛能 (%2) 點評價。} {#add pot %1;#add sc %2}');
 e.receive('你得到 0 點潛能 1 點評價。');assert.equal(e.variables.pot,'0');assert.equal(e.variables.sc,'1');
 e.receive('你得到 20 點潛能 3 點評價。');assert.equal(e.variables.pot,'20');assert.equal(e.variables.sc,'4');assert.deepEqual(sent,[]);
});
test('two normal captures remain compatible and explicit slots can appear out of order',()=>{
 const {e}=fixture();e.execute('#TRIGGER {^gain (%d) and (%d)$} {#ADD x %1;#ADD y %2}');e.receive('gain 2 and 3');
 assert.equal(e.variables.x,'2');assert.equal(e.variables.y,'3');
 e.execute('#TRIGGER {^swap (%2) then (%1)$} {#ADD a %1;#ADD b %2}');e.receive('swap 5 then 7');
 assert.equal(e.variables.a,'7');assert.equal(e.variables.b,'5');
 assert.throws(()=>compilePattern('(%2) x (%2)'),/編號/);
});
test('ADD supports aliases, multiple increments, negative values, decimals and whitespace',()=>{
 const {e}=fixture();e.execute('#ALIAS award {#ADD total %1 %2};award 2 3;#ADD total -1;#ADD decimal 1.5 0.5;#ADD total { 0 }');
 assert.equal(e.variables.total,'4');assert.equal(e.variables.decimal,'2');
});
test('invalid ADD values do not partially change a counter or reach the server',()=>{
 const {e,sent}=fixture();e.execute('#VAR n 10');
 for(const source of ['#ADD n 1 bad','#ADD n NaN','#ADD n Infinity','#ADD n %2','#ADD n {}','#ADD n 9007199254740991','#ADD bad-name 1','#ADD n'])assert.throws(()=>e.execute(source));
 assert.equal(e.variables.n,'10');e.execute('#VAR text abc');assert.throws(()=>e.execute('#ADD text 1'));assert.equal(e.variables.text,'abc');assert.deepEqual(sent,[]);
});
test('text CAP triggers convert to pattern capture rules and retain other trigger actions',()=>{
 const {e,captured,sent}=fixture();
 const r=importScript(Buffer.from('#TRIGGER {^你得到 (%d) 點經驗。$} {#cap {實戰 紀錄};#ADD exp %1} combat'),{});
 assert.equal(r.summary.converted,1);assert.equal(r.engine.triggers[0].body,'#ADD exp %1');
 assert.equal(r.engine.captures[0].match,'pattern');assert.equal(r.engine.captures[0].target,'實戰 紀錄');assert.equal(r.engine.captures[0].group,'combat');
 e.restore(r.engine);e.receive('你得到 12 點經驗。');assert.deepEqual(captured,[]);assert.equal(e.variables.exp,undefined);
 e.captures[0].enabled=true;e.triggers[0].enabled=true;e.receive('你得到 12 點經驗。');
 assert.deepEqual(captured,[{target:'實戰 紀錄',line:'你得到 12 點經驗。'}]);assert.equal(e.variables.exp,'12');assert.deepEqual(sent,[]);
 e.execute('#T- combat');e.receive('你得到 5 點經驗。');assert.equal(captured.length,1);
});
test('CAP-only triggers move out of Trigger and repeated imports do not duplicate captures',()=>{
 const source=Buffer.from('#TRIGGER {^Notice: (%2)$} {#CAP news;#cap news} chat');
 const r=importScript(source,{});assert.equal(r.engine.triggers.length,0);assert.equal(r.engine.captures.length,1);
 const again=importScript(source,r.engine);assert.equal(again.engine.captures.length,1);
 const {e,captured}=fixture();e.restore(again.engine);e.captures[0].enabled=true;e.receive('Notice: hello');assert.equal(captured[0].line,'Notice: hello');
});
test('binary legacy CAP trigger converts without executing any imported command',()=>{
 const word=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
 const str=s=>{const b=iconv.encode(s,'big5');return Buffer.concat([word(b.length),b,...(b.length?[Buffer.from([0])]:[])]);};
 const source=Buffer.concat([LEGACY_HEADER,str('status'),Buffer.from([7]),Buffer.from('Courier'),Buffer.from([10,0,0]),word(0),str(''),str('^系統 (%d)$'),str('#cap system'),str('news'),Buffer.from('0101010000000000000100','hex'),str('')]);
 const r=importScript(source,{});assert.equal(r.summary.captures,1);assert.equal(r.summary.triggers,0);assert.equal(r.engine.captures[0].enabled,false);
 const restored=new Engine();restored.restore(JSON.parse(JSON.stringify(r.engine)));assert.equal(restored.captures[0].match,'pattern');
});
test('existing literal captures stay literal; pattern captures match variables and deduplicate output',()=>{
 const {e,captured}=fixture();e.restore({variables:{who:'Bob'},captures:[{text:'(%d)',target:'literal'},{text:'^@who (%d)$',target:'match',match:'pattern'},{text:'Bob',target:'match'}]});
 e.receive('Bob 12');assert.deepEqual(captured,[{target:'match',line:'Bob 12'}]);
 e.receive('literal (%d)');assert.equal(captured[1].target,'literal');
 const before=e.snapshot();assert.throws(()=>e.restore({...before,captures:[{text:'(',target:'bad',match:'pattern'}]}));assert.deepEqual(e.snapshot(),before);
});
test('conditional CAP is retained rather than made unconditional',()=>{
 const r=importScript(Buffer.from('#TRIGGER ready {#IF (0) {#CAP secret}}'),{});
 assert.equal(r.summary.converted,0);assert.equal(r.engine.captures.length,0);assert.equal(r.engine.triggers.length,1);
});
