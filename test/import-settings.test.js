import test from 'node:test';
import assert from 'node:assert/strict';
import iconv from 'iconv-lite';
import { importScript, decodeScript } from '../src/import-settings.js';
import { LEGACY_HEADER } from '../src/legacy-mud.js';
const word = n => { const b=Buffer.alloc(2);b.writeUInt16LE(n);return b; };
const text = s => { const b=iconv.encode(s,'big5');return Buffer.concat([word(b.length),b,...(b.length?[Buffer.from([0])]:[])]); };
// Synthetic data only: never commit a user's private rules or variables.
function legacy({flags='0101010000000000000100',aliasName='testalias'}={}) {
 return Buffer.concat([LEGACY_HEADER,text('status'),Buffer.from([7]),Buffer.from('Courier'),Buffer.from([10,0,0]),word(0),
 text(aliasName),text('look'),text(''),text('@hp'),text('100'),text('0'),text(''),
 text('準備完成'),text('#2 look'),text('combat'),Buffer.from(flags,'hex'),text(''),Buffer.from([1,2,3])]);
}
test('imports definitions as data, disabled, without evaluating commands or variable expressions',()=>{
 const current={aliases:[{name:'old',body:'score',enabled:true}],variables:{keep:'yes'}};
 const bytes=Buffer.from('#ALIAS {test} {#SEND secret;look};#TRIGGER {ready} {#WA 1;look} combat\n#VAR hp [1+2]');
 const r=importScript(bytes,current);
 assert.equal(r.summary.aliases,1);assert.equal(r.summary.triggers,1);assert.equal(r.engine.variables.hp,'[1+2]');
 assert.equal(r.engine.aliases[1].enabled,false);assert.equal(r.engine.triggers[0].enabled,false);assert.equal(current.aliases.length,1);
});
test('supports UTF-8, Big5 and BOM-prefixed UTF-16 text',()=>{
 for(const [bytes,encoding] of [[Buffer.from('#VAR title 中文'),'UTF-8'],[iconv.encode('#VAR title 中文','big5'),'Big5'],[Buffer.concat([Buffer.from([255,254]),Buffer.from('#VAR title 中文','utf16le')]),'UTF-16LE']]) {
  const r=importScript(bytes,{});assert.equal(r.summary.encoding,encoding);assert.equal(r.engine.variables.title,'中文');
 }
});
test('unknown commands and malformed definitions fail atomically',()=>{
 const state={variables:{keep:'yes'}};
 for(const s of ['#VAR a b;#SEND nope','#ALIAS only','#VAR x y extra','#ALIAS {x} {unclosed','look'])assert.throws(()=>importScript(Buffer.from(s),state));
 assert.deepEqual(state,{variables:{keep:'yes'}});
});
test('same-name rules replace existing records while unrelated rules remain',()=>{
 const r=importScript(Buffer.from('#ALIAS A {new}'),{aliases:[{name:'a',body:'old'},{name:'b',body:'look'}]});
 assert.equal(r.summary.replaced,1);assert.equal(r.engine.aliases.length,2);assert.equal(r.engine.aliases[0].body,'new');
});
test('empty input, binary garbage and oversize input are rejected',()=>{
 for(const b of [Buffer.alloc(0),Buffer.from('#NOP comment'),Buffer.from([1,0,255]),Buffer.alloc(2_000_001)])assert.throws(()=>importScript(b,{}));
 assert.throws(()=>decodeScript(Buffer.from([0])),/二進位/);
});
test('imports verified legacy binary fields and reports unconverted data and commands',()=>{
 const r=importScript(legacy(),{});
 assert.equal(r.summary.aliases,1);assert.equal(r.summary.triggers,1);assert.equal(r.summary.variables,1);
 assert.equal(r.engine.variables.hp,'100');assert.equal(r.engine.aliases[0].enabled,false);assert.equal(r.engine.triggers[0].enabled,false);
 assert.equal(r.engine.triggers[0].pattern,'準備完成');assert.equal(r.engine.triggers[0].group,'combat');
 assert(r.summary.warnings.some(w=>w.includes('#2')));assert(r.summary.warnings.some(w=>w.includes('3 bytes')));
});
test('rejects unverified binary signatures, unsupported flags and truncated records',()=>{
 const changed=legacy();changed[0]=0;
 assert.throws(()=>importScript(changed,{}),/尚未支援/);
 assert.throws(()=>importScript(legacy({flags:'0000000000000000000000'}),{}),/旗標/);
 for(const end of [22,40,75,legacy().length-7])assert.throws(()=>importScript(legacy().subarray(0,end),{}));
});
test('reports incompatible legacy definitions without executing or silently importing them',()=>{
 const r=importScript(legacy(),{aliases:[{name:'testalias',body:'old'}]});
 assert.equal(r.summary.replaced,1);assert.equal(r.engine.aliases[0].body,'look');
 assert.equal(r.engine.triggers[0].enabled,false);
});

test('incompatible native definitions are counted in warnings while valid records remain disabled',()=>{
 const r=importScript(legacy({aliasName:'不支援的中文別名'}),{});
 assert.equal(r.summary.aliases,0);assert.equal(r.summary.triggers,1);assert.equal(r.summary.variables,1);
 assert(r.summary.warnings.some(w=>w.includes('第 1 項未匯入')));
 assert.equal(r.engine.triggers[0].enabled,false);
});
