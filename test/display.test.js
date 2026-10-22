import test from 'node:test';
import assert from 'node:assert/strict';
import headless from '@xterm/headless';
import {TerminalOutput} from '../src/terminal-output.js';
import {normalizePreferences,terminalTheme,migrateSettings,CLASSIC_COLORS} from '../src/preferences.js';
const write=(term,text)=>new Promise(resolve=>term.write(text,resolve));
function terminal(t){const term=new headless.Terminal({cols:120,rows:20,allowProposedApi:true});t.after(()=>term.dispose());return term;}
test('NOR variants reset foreground, background and bold attributes',async t=>{
 for(const nor of ['\x1b[m','\x1b[0m','\x1b[2;37;0m']){
  const term=terminal(t),output=new TerminalOutput();
  await write(term,output.server('\x1b[1;31;44mX'+nor+'Y'));
  const colored=term.buffer.active.getLine(0).getCell(0),normal=term.buffer.active.getLine(0).getCell(1);
  assert.equal(colored.getFgColor(),1);assert.equal(colored.getBgColor(),4);assert.ok(colored.isBold());
  assert.ok(normal.isFgDefault(),nor);assert.ok(normal.isBgDefault(),nor);assert.equal(normal.isBold(),0);
 }
});
test('command echo ends server styling and leaves the next line at defaults',async t=>{
 const term=terminal(t),output=new TerminalOutput();
 await write(term,output.server('\x1b[1;31;44m紅'));
 await write(term,output.local('› look','#c4a36b'));
 await write(term,output.server('續\x1b[0m常'));
 const line=term.buffer.active.getLine(2),continued=line.getCell(0),normal=line.getCell(2);
 assert.equal(continued.getChars(),'續');assert.ok(continued.isFgDefault());assert.ok(continued.isBgDefault());assert.equal(continued.isBold(),0);assert.ok(normal.isFgDefault());assert.ok(normal.isBgDefault());
});
test('NOR reset split across network packets is not interrupted by local text',async t=>{
 const term=terminal(t),output=new TerminalOutput();
 await write(term,output.server('\x1b[31m紅\x1b['));
 await write(term,output.local('[系統] 提示','#aaaaaa'));
 await write(term,output.server('0m正常'));
 const cell=term.buffer.active.getLine(2).getCell(0);assert.equal(cell.getChars(),'正');assert.ok(cell.isFgDefault());assert.equal(output.pending,'');
});
test('local notices reset truecolor for subsequent server lines',async t=>{
 const term=terminal(t),output=new TerminalOutput();
 await write(term,output.server('\x1b[38;2;0;128;255mA'));
 await write(term,output.local('notice','#c4a36b'));
 await write(term,output.server('B'));
 const original=term.buffer.active.getLine(0).getCell(0);assert.ok(original.isFgRGB());assert.equal(original.getFgColor(),0x0080ff);
 const cell=term.buffer.active.getLine(2).getCell(0);assert.ok(cell.isFgDefault());
});
test('local text does not inject control sequences into terminal state',()=>{
 const output=new TerminalOutput(),text=output.local('hello\x1b[31m','#aaaaaa');assert.ok(!text.includes('hello\x1b[31m'));assert.equal(output.attributes.size,0);
});
test('new display defaults hide connection details and use classic NOR colors',()=>{
 const p=normalizePreferences();assert.equal(p.showConnectionInfo,false);assert.equal(p.boldAsBright,true);assert.equal(p.columns,120);assert.equal(p.fontSize,14);assert.equal(p.colors.foreground,'#aaaaaa');assert.equal(p.colors.background,'#000000');assert.equal(terminalTheme(p).red,CLASSIC_COLORS.red);
});
test('custom ANSI and default reset colors round-trip without modifying truecolor',()=>{
 const p=normalizePreferences({colors:{red:'#AbC123',foreground:'#123456'},columns:160,fontSize:16});
 const restored=normalizePreferences(JSON.parse(JSON.stringify(p)));assert.deepEqual(p,restored);assert.equal(terminalTheme(p).red,'#abc123');assert.equal(terminalTheme(p).foreground,'#123456');
 assert.throws(()=>normalizePreferences({colors:{red:'url(unsafe)'}}));assert.throws(()=>normalizePreferences({columns:0}));assert.throws(()=>normalizePreferences({fontSize:100}));
});
test('existing Windcloud profiles migrate to WSS and keep aliases untouched',()=>{
 const engine={aliases:[{name:'kk',body:'kill %1'}]},p=migrateSettings({version:1,host:'125.228.186.144',port:8000,transport:'auto',engine});
 assert.equal(p.transport,'websocket');assert.equal(p.version,2);assert.equal(p.engine,engine);assert.equal(p.preferences.showConnectionInfo,false);
 const custom=migrateSettings({version:1,host:'localhost',port:18880,transport:'telnet'});assert.equal(custom.transport,'telnet');
 const explicit=migrateSettings({version:2,host:'windcloud.muds.me',transport:'telnet'});assert.equal(explicit.transport,'telnet');
});
test('fixed terminal columns preserve a CJK table when the viewport width changes',async t=>{
 const term=terminal(t),output=new TerminalOutput();
 await write(term,output.server('名稱            狀態\r\n風雲再起        正常\r\n'));
 const before=term.buffer.active.getLine(1).translateToString();term.resize(120,10);term.resize(120,25);
 assert.equal(term.buffer.active.getLine(1).translateToString(),before);assert.equal(term.buffer.active.getLine(1).getCell(16).getChars(),'正');
});

test('line feeds reset colors and effects across packet boundaries while same-line chunks retain styling',async t=>{
 const term=terminal(t),output=new TerminalOutput();
 await write(term,output.server('\x1b[1;31;44mA'));
 await write(term,output.server('B\r'));
 await write(term,output.server('\nC\x1b[32mD\r\nE'));
 const first=term.buffer.active.getLine(0),second=term.buffer.active.getLine(1),third=term.buffer.active.getLine(2);
 assert.equal(first.getCell(1).getFgColor(),1);assert.ok(first.getCell(1).isBold());
 assert.ok(second.getCell(0).isFgDefault());assert.ok(second.getCell(0).isBgDefault());assert.equal(second.getCell(0).isBold(),0);
 assert.equal(second.getCell(1).getFgColor(),2);assert.ok(third.getCell(0).isFgDefault());assert.equal(output.attributes.size,0);
});
test('LF alone resets styling and multiline local messages finish at defaults',async t=>{
 const term=terminal(t),output=new TerminalOutput();
 await write(term,output.server('\x1b[38;2;0;128;255mA\nB'));
 assert.ok(term.buffer.active.getLine(1).getCell(1).isFgDefault());
 await write(term,output.local('first\nsecond','#c4a36b'));
 await write(term,output.server('C'));
 assert.ok(term.buffer.active.getLine(3).getCell(5).isFgDefault());
 assert.ok(term.buffer.active.getLine(4).getCell(0).isFgDefault());
});
