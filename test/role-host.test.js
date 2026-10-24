import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import path from 'node:path';
const source = await fs.readFile(new URL('../src/role-host.cjs', import.meta.url),'utf8');
function fixture() {
  let nextId = 0; const channels = new Map();
  class Window extends EventEmitter {
    constructor() { super(); this.webContents = new EventEmitter(); Object.assign(this.webContents,{ id:++nextId, mainFrame:{}, setWindowOpenHandler(){}, send:(name,data)=>{this.message={name,data};} }); this.contentView={children:[],addChildView:v=>this.contentView.children.push(v),removeChildView:v=>{this.contentView.children=this.contentView.children.filter(c=>c!==v);}}; }
    getContentSize(){return [900,700];} isDestroyed(){return !!this.destroyed;} destroy(){this.destroyed=true;this.emit('closed');} setMenuBarVisibility(){} setTitle(s){this.title=s;} isMinimized(){return !!this.minimized;} restore(){this.minimized=false;} focus(){this.focused=true;} async loadFile(){} close(){this.emit('close',{preventDefault(){}});}
  }
  const context = { require:name=>name==='electron'?{BrowserWindow:Window,ipcMain:{handle:(name,fn)=>channels.set(name,fn)}}:path, __dirname:'/test', module:{exports:{}} };
  vm.runInNewContext(source,context);
  const api=context.module.exports;
  function role(id){return {profile:{id,name:id},contents:{focus(){},send(name){this.message=name;}},view:{setVisible(value){this.visible=value;},setBounds(bounds){this.bounds=bounds;}}};}
  const invoke=(host,action,id,frame=host.window.webContents.mainFrame)=>channels.get('role-host')({sender:host.window.webContents,senderFrame:frame},action,id);
  return {api,role,invoke};
}
test('switching role tabs preserves each view and sizes it below the role toolbar',async()=>{
 const {api,role,invoke}=fixture(),host=await api.createHost(),a=role('a'),b=role('b');api.attach(host,a);api.attach(host,b);
 assert.equal(a.view.visible,false);assert.equal(b.view.visible,true);assert.equal(a.view.bounds.y,42);assert.equal(a.view.bounds.height,658);
 await invoke(host,'select','a');assert.equal(a.view.visible,true);assert.equal(b.view.visible,false);assert.equal(host.window.contentView.children.length,2);
 await invoke(host,'add');assert.equal(a.contents.message,'new-role');
 await invoke(host,'select','b',{});assert.equal(host.active,a,'subframe cannot switch role');
});
test('closing one role retains the other, closing the last role destroys its host',async()=>{
 const {api,role,invoke}=fixture(),host=await api.createHost(),a=role('a'),b=role('b');api.attach(host,a);api.attach(host,b);
 b.close=async()=>{api.detach(host,b);};await invoke(host,'close','b');assert.equal(host.active,a);assert.equal(host.window.isDestroyed(),false);
 api.detach(host,a);assert.equal(host.window.isDestroyed(),true);
});
test('window close waits for all role saves and only destroys after completion',async()=>{
 const {api,role}=fixture(),host=await api.createHost(),a=role('a'),b=role('b');api.attach(host,a);api.attach(host,b);
 let finishA,finishB;a.close=()=>new Promise(resolve=>{finishA=()=>{api.detach(host,a);resolve(true);};});b.close=()=>new Promise(resolve=>{finishB=()=>{api.detach(host,b);resolve(true);};});
 host.window.close();assert.equal(host.closing,true);assert.equal(host.window.isDestroyed(),false);
 finishA();await new Promise(setImmediate);assert.equal(host.window.isDestroyed(),false);
 finishB();await new Promise(setImmediate);assert.equal(host.window.isDestroyed(),true);
});
test('failed role save preserves that role and allows retrying window close',async()=>{
 const {api,role}=fixture(),host=await api.createHost(),a=role('a'),b=role('b');api.attach(host,a);api.attach(host,b);
 a.close=async()=>false;b.close=async()=>{api.detach(host,b);return true;};host.window.close();await new Promise(setImmediate);
 assert.equal(host.window.isDestroyed(),false);assert.equal(host.tabs.length,1);assert.equal(host.closing,false);
 a.close=async()=>{api.detach(host,a);return true;};host.window.close();await new Promise(setImmediate);assert.equal(host.window.isDestroyed(),true);
});
