import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
import { executeInput, echoTriggeredCommand } from '../src/input.js';
function fixture(t) {
  t.mock.timers.enable({apis:['setTimeout']});
  const events=[]; const e=new Engine({send:s=>events.push(['send',s]),echo:s=>events.push(['echo',s])});
  t.after(()=>e.cancelPending()); return {e,events,tick:n=>t.mock.timers.tick(n)};
}
test('TRI abbreviation defines a trigger and echoes each actual expanded command once',t=>{
  const {e,events}=fixture(t);e.execute('#ALIAS kk {kill %1;kick %1};#tri {^Target (%w)$} {kk %1;#SEND {look}} combat');
  e.receive('Target rabbit');assert.deepEqual(events,[['echo','kill rabbit'],['send','kill rabbit'],['echo','kick rabbit'],['send','kick rabbit'],['echo','look'],['send','look']]);
});
test('delayed trigger echoes at execution time and direct input does not get a second echo',t=>{
  const {e,events,tick}=fixture(t);e.execute('#TRI ready {#wa 1000;pp}');e.receive('ready');assert.deepEqual(events,[]);
  executeInput({text:'look',engine:e,echo:s=>events.push(['manual',s])});assert.deepEqual(events,[['manual','look'],['send','look']]);
  tick(1000);assert.deepEqual(events.slice(-2),[['echo','pp'],['send','pp']]);
});
test('TR- disables only the requested trigger group, keeping aliases and captures active',t=>{
  const {e,events}=fixture(t);const captured=[];e.capture=x=>captured.push(x);
  e.execute('#ALIAS heal {drink potion} combat;#TRI ready {pp} combat;#TRI ready {score} other');
  const saved=e.snapshot();saved.captures=[{text:'ready',target:'system',group:'combat'}];e.restore(saved);
  e.execute('#tr- combat');e.receive('ready');e.execute('heal');
  assert.deepEqual(events,[['echo','score'],['send','score'],['send','drink potion']]);assert.equal(captured.length,1);
  e.execute('#tr+ combat');events.length=0;e.receive('ready');assert.deepEqual(events,[['echo','pp'],['send','pp'],['echo','score'],['send','score']]);
});
test('TR+ keeps individually disabled rules off and legacy T- still applies',t=>{
  const {e,events}=fixture(t);e.execute('#TRI ready pp combat');e.triggers[0].enabled=false;e.execute('#TR+ combat');e.receive('ready');assert.deepEqual(events,[]);
  e.triggers[0].enabled=true;e.execute('#T- combat;#TR+ combat');e.receive('ready');assert.deepEqual(events,[]);
});
test('TR- cancels that group pending trigger but does not cancel a different group',t=>{
  const {e,events,tick}=fixture(t);e.execute('#TRI ready {#wa 1000;pp} combat');e.receive('ready');e.execute('#TR- other');tick(1000);assert.deepEqual(events,[['echo','pp'],['send','pp']]);
  events.length=0;e.receive('ready');e.execute('#TR- combat');tick(1000);assert.deepEqual(events,[]);
});
test('trigger group switches persist and legacy profiles default to enabled',t=>{
  const {e}=fixture(t);e.execute('#TRI ready pp combat;#TR- combat');const copy=new Engine();copy.restore(JSON.parse(JSON.stringify(e.snapshot())));assert.equal(copy.triggerGroups.combat,false);
  const old=e.snapshot();delete old.triggerGroups;copy.restore(old);assert.equal(copy.active(copy.triggers[0],true),true);
  for(const cmd of ['#TR-','#TR+ {}','#TR- one two'])assert.throws(()=>e.execute(cmd));
});
test('password prompt trigger responses and manual secret inputs never echo',t=>{
  const {e,events}=fixture(t);e.echo=text=>echoTriggeredCommand({text,passwordPrompt:true,echo:s=>events.push(['echo',s])});
  e.execute('#TRI {Password:} {secret-password}');e.receive('Password:');assert.deepEqual(events,[['send','secret-password']]);
  events.length=0;executeInput({text:'secret',secret:true,engine:e,send:s=>events.push(['send',s]),echo:s=>events.push(['manual',s])});assert.deepEqual(events,[['send','secret']]);
});

test('TR TRI and TRIGGER group switch spellings are interchangeable and case insensitive',t=>{
 const {e,events}=fixture(t);e.execute('#tri ready pp combat');
 for(const disable of ['#tr-','#tri-','#trigger-','#TrIgGeR-']){
  for(const enable of ['#tr+','#tri+','#trigger+','#TrI+']){
   e.execute(disable+' combat');e.receive('ready');assert.deepEqual(events,[]);
   e.execute(enable+' combat');e.receive('ready');assert.deepEqual(events,[['echo','pp'],['send','pp']]);events.length=0;
  }
 }
});

test('legacy T- also cancels a pending trigger from its group',t=>{
 const {e,events,tick}=fixture(t);e.execute('#tri ready {#wa 1000;pp} combat');e.receive('ready');e.execute('#T- combat');tick(1000);assert.deepEqual(events,[]);
});
