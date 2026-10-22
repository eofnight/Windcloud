import test from 'node:test';
import assert from 'node:assert/strict';
import {executeInput,prepareInput} from '../src/input.js';
import {Engine} from '../src/engine.js';
function fixture() {const events=[];return {events,send:text=>events.push(['send',text]),echo:text=>events.push(['echo',text])};}
test('manual commands echo before script expansion or game output',()=>{
  const f=fixture(),engine=new Engine({send:f.send});engine.execute('#ALIAS kk {kill %1;kick %1}');
  executeInput({...f,engine,text:'kk rabbit'});assert.deepEqual(f.events,[['echo','kk rabbit'],['send','kill rabbit'],['send','kick rabbit']]);
});
test('client commands echo locally and are not sent to the game',()=>{
  const f=fixture(),engine=new Engine({send:f.send});executeInput({...f,engine,text:'#cap【系統】連線精靈： system'});assert.deepEqual(f.events,[['echo','#cap【系統】連線精靈： system']]);
});
test('manual and automatically recognized passwords bypass parsing and never echo',()=>{
  for(const flags of [{secret:true},{passwordPrompt:true}]){
    const f=fixture(),engine=new Engine({send:f.send});const result=executeInput({...f,engine,text:'secret;#SHOW password',...flags});
    assert.deepEqual(f.events,[['send','secret;#SHOW password']]);assert.equal(result.secret,true);
  }
});
test('blank Enter reaches the server and gets a local echo',()=>{
  const f=fixture(),engine=new Engine({send:f.send});executeInput({...f,engine,text:''});assert.deepEqual(f.events,[['echo',''],['send','']]);
});
test('invalid input is rejected before any echo',()=>{
  const f=fixture(),engine=new Engine();assert.throws(()=>executeInput({...f,engine,text:null}));assert.deepEqual(f.events,[]);
});
test('normal input stays intact and selected, secrets clear before awaiting IPC',()=>{
  const events=[];const input={value:'look',focus:()=>events.push('focus'),select:()=>events.push('select')};prepareInput(input,false);assert.equal(input.value,'look');assert.deepEqual(events,['focus','select']);
  events.length=0;input.value='password';prepareInput(input,true);assert.equal(input.value,'');assert.deepEqual(events,['focus']);
});
