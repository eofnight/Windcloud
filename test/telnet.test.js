import test from 'node:test';
import assert from 'node:assert/strict';
import {Telnet,LineStream} from '../src/telnet.js';
test('Telnet negotiates split packets and refuses unsupported compression',()=>{
 const replies=[];const t=new Telnet({reply:b=>replies.push([...b])});
 assert.deepEqual([...t.feed([65,255])],[65]);assert.deepEqual([...t.feed([253])],[]);t.feed([24,255,251,86]);assert.deepEqual(replies,[[255,251,24],[255,254,86]]);
});
test('escaped IAC and terminal type subnegotiation',()=>{
 const replies=[];const t=new Telnet({reply:b=>replies.push([...b])});t.feed([255,253,24]);t.feed([255,250,24,1,255]);t.feed([240]);assert.equal(new TextDecoder().decode(Uint8Array.from(replies[1].slice(4,-2))),'WINDCLOUD');assert.deepEqual([...t.feed([255,255,65])],[255,65]);
});
test('password echo status follows server negotiation',()=>{
 const echo=[];const t=new Telnet({echo:b=>echo.push(b)});t.feed([255,251,1]);t.feed([255,252,1]);assert.deepEqual(echo,[false,true]);
});
test('NAWS escapes dimension bytes equal to IAC',()=>{
 const replies=[];const t=new Telnet({reply:b=>replies.push([...b])});t.resize(255,30);t.feed([255,253,31]);assert.deepEqual(replies[1],[255,250,31,0,255,255,0,30,255,240]);
});
test('ANSI sequences and lines survive packet boundaries',()=>{
 const lines=[],prompts=[];const s=new LineStream(l=>lines.push(l),p=>prompts.push(p));s.feed('\x1b[1;');s.feed('36m風雲\x1b[m\r');s.feed('\nName:');s.flushPrompt();s.flushPrompt();assert.deepEqual(lines,['風雲']);assert.deepEqual(prompts,['Name:']);s.feed(' ');s.flushPrompt();assert.deepEqual(prompts,['Name:','Name: ']);
});
test('OSC title and split terminator are excluded from matching text',()=>{
 const lines=[];const s=new LineStream(l=>lines.push(l),()=>{});s.feed('hello\x1b]0;malicious');s.feed('\x1b');s.feed('\\world\n');assert.deepEqual(lines,['helloworld']);
});
