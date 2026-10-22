import test from 'node:test';
import assert from 'node:assert/strict';
import iconv from 'iconv-lite';
import {Telnet,LineStream} from '../src/telnet.js';
import {Engine} from '../src/engine.js';
test('Big5 multibyte characters, Telnet controls and ANSI work at every byte boundary',()=>{
 const wire=Buffer.concat([Buffer.from([255,253,24]),iconv.encode('\x1b[36m你口渴了\x1b[m\r\n','big5')]);
 for(let cut=0;cut<=wire.length;cut++){
   const sent=[];const engine=new Engine({send:t=>sent.push(t)});engine.execute('#TRIGGER {你口渴了} {drink waterskin}');
   const telnet=new Telnet(),decoder=iconv.getDecoder('big5'),lines=new LineStream(t=>engine.receive(t),()=>{});
   for(const chunk of [wire.subarray(0,cut),wire.subarray(cut)])lines.feed(decoder.write(Buffer.from(telnet.feed(chunk))));
   assert.deepEqual(sent,['drink waterskin'],`split at ${cut}`);
 }
});
