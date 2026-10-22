import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import headless from '@xterm/headless';
import {mudUnicode,installMudUnicode} from '../src/mud-unicode.js';
const write=(term,text)=>new Promise(resolve=>term.write(text,resolve));
const banner=fs.readFileSync(new URL('./fixtures/windcloud-banner.txt',import.meta.url),'utf8').trimEnd().split('\n');
test('actual Windcloud banner is 84 cells wide on every row with CJK symbols',()=>{
 for(const line of banner)assert.equal([...line].reduce((n,c)=>n+mudUnicode.wcwidth(c.codePointAt(0)),0),84,line);
});
test('terminal cell allocation aligns both sides of the actual public banner',async t=>{
 const term=new headless.Terminal({allowProposedApi:true,cols:120,rows:20});t.after(()=>term.dispose());installMudUnicode(term);
 await write(term,banner.join('\r\n'));
 for(let row=1;row<7;row++){
  const line=term.buffer.active.getLine(row);assert.equal(line.getCell(5).getChars(),'◎');assert.equal(line.getCell(5).getWidth(),2);assert.equal(line.getCell(82).getChars(),'◎');assert.equal(line.getCell(82).getWidth(),2);assert.equal(line.getCell(84).getChars(),'');
 }
});
test('ASCII stays one cell, box drawing and Chinese use two cells, marks join',async t=>{
 const term=new headless.Terminal({allowProposedApi:true,cols:120,rows:20});t.after(()=>term.dispose());installMudUnicode(term);
 for(const c of 'ABC 123')assert.equal(mudUnicode.wcwidth(c.codePointAt(0)),1);
 for(const c of '╭─│┼◎風雲◢█')assert.equal(mudUnicode.wcwidth(c.codePointAt(0)),2);
 assert.equal(mudUnicode.wcwidth(0x0301),0);
 await write(term,'e\u0301╭A');const line=term.buffer.active.getLine(0);assert.equal(line.getCell(0).getChars(),'é');assert.equal(line.getCell(1).getChars(),'╭');assert.equal(line.getCell(3).getChars(),'A');
});
test('ANSI colors do not alter banner alignment',async t=>{
 const term=new headless.Terminal({allowProposedApi:true,cols:120,rows:20});t.after(()=>term.dispose());installMudUnicode(term);
 await write(term,'\x1b[1;36m'+banner[1]+'\x1b[0m');const cell=term.buffer.active.getLine(0).getCell(82);assert.equal(cell.getChars(),'◎');assert.equal(cell.getFgColor(),6);
});
