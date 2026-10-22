import test from 'node:test';
import assert from 'node:assert/strict';
import headless from '@xterm/headless';
import {handleTerminalKey} from '../src/keyboard.js';
function fixture(key,target) {
  const input={value:'old command',tagName:'INPUT'},pages=[];
  const event={key,target:target||input,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
  return {input,pages,event,options:{input,scrollPage:n=>pages.push(n)}};
}
test('Escape clears the command field, including password fields, without submitting',()=>{
  const f=fixture('Escape');f.input.type='password';assert.equal(handleTerminalKey(f.event,f.options),true);assert.equal(f.input.value,'');assert.ok(f.event.prevented);assert.ok(f.event.stopped);assert.deepEqual(f.pages,[]);
});
test('PageUp and PageDown scroll without changing retained command text',()=>{
  for(const [key,direction] of [['PageUp',-1],['PageDown',1]]){
    const f=fixture(key);assert.ok(handleTerminalKey(f.event,f.options));assert.deepEqual(f.pages,[direction]);assert.equal(f.input.value,'old command');
  }
});
test('Page keys work from xterm hidden textarea and respect native rule editors',()=>{
  const f=fixture('PageUp',{tagName:'TEXTAREA'});assert.equal(handleTerminalKey(f.event,f.options),false);
  assert.equal(handleTerminalKey(f.event,{...f.options,inTerminal:true}),true);assert.deepEqual(f.pages,[-1]);
});
test('composition, dialogs and modified shortcuts keep their native behavior',()=>{
  for(const flags of [{isComposing:true},{ctrlKey:true},{altKey:true},{metaKey:true}]){
    const f=fixture('Escape');Object.assign(f.event,flags);assert.equal(handleTerminalKey(f.event,f.options),false);assert.equal(f.input.value,'old command');
  }
  const f=fixture('PageDown');assert.equal(handleTerminalKey(f.event,{...f.options,dialogOpen:true}),false);assert.deepEqual(f.pages,[]);
});
test('PageUp and PageDown move through real terminal scrollback',async t=>{
  const term=new headless.Terminal({cols:80,rows:5,scrollback:100,allowProposedApi:true});t.after(()=>term.dispose());
  await new Promise(resolve=>term.write(Array.from({length:25},(_,i)=>'line '+i+'\r\n').join(''),resolve));
  const f=fixture('PageUp');const before=term.buffer.active.viewportY;
  handleTerminalKey(f.event,{...f.options,scrollPage:n=>term.scrollPages(n)});assert.ok(term.buffer.active.viewportY<before);
  f.event.key='PageDown';handleTerminalKey(f.event,{...f.options,scrollPage:n=>term.scrollPages(n)});assert.equal(term.buffer.active.viewportY,before);
});
