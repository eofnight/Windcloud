import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Engine } from '../src/engine.js';
import { SharedCaptures } from '../src/shared-captures.js';
import profilesModule from '../src/profiles.cjs';
const { ProfileStore } = profilesModule;
test('bare rule commands list all rules without sending or executing their bodies',()=>{
 const sent=[],notices=[];const e=new Engine({send:s=>sent.push(s),notice:s=>notices.push(s)});
 e.restore({aliases:[{name:'a',body:'danger',enabled:false,group:'g'}],triggers:[{pattern:'ready',body:'danger',enabled:false,group:'g'}],timers:[{name:'clock',seconds:10,mode:'repeat',body:'danger'}],variables:{n:'12'},captures:[{text:'ready',target:'news'}]});
 const before=e.snapshot();
 for(const command of ['#tr','#TRIGGER','#tri','#alias','#al','#ti','#timer','#var','#variable','#va','#cap'])e.execute(command);
 assert.equal(notices.length,11);assert(notices[0].includes('ready'));assert(notices[0].includes('停用'));assert(notices[3].includes('a'));assert(notices[5].includes('clock'));assert(notices[5].includes('10 秒'));assert(notices[7].includes('n = 12'));
 assert.deepEqual(sent,[]);assert.deepEqual(e.snapshot(),before);assert.equal(e.timers.running.size,0);
});
test('empty rule commands report empty lists and malformed definitions still fail',()=>{
 const notices=[];const e=new Engine({notice:s=>notices.push(s)});
 for(const command of ['#tr','#trigger','#alias','#ti','#timer','#var','#cap'])e.execute(command);
 assert(notices.every(s=>s.startsWith('尚無')));assert.throws(()=>e.execute('#TR pattern'),/缺少參數/);assert.throws(()=>e.execute('#TIMER unknown'),/格式/);
});
test('profiles preserve legacy location and survive restart with independent paths',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'windcloud-profiles-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new ProfileStore(root);await store.load();
 await fs.writeFile(path.join(root,'settings.json'),'legacy');
 const [a,b]=await Promise.all([store.create('角色一'),store.create('角色二')]);
 assert.notEqual(a.id,b.id);assert.equal(store.directory('default'),root);assert.notEqual(store.directory(a.id),store.directory(b.id));
 const restored=new ProfileStore(root);await restored.load();assert.equal(restored.list().length,3);assert.deepEqual(restored.get(a.id),a);
 assert.equal(await fs.readFile(path.join(root,'settings.json'),'utf8'),'legacy');
 assert.throws(()=>store.directory('../escape'),/無效/);await assert.rejects(store.create('角色一'),/相同名稱/);await assert.rejects(store.create('  '),/名稱/);
});
test('concurrent duplicate profile creation cannot create conflicting settings',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'windcloud-profiles-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new ProfileStore(root);await store.load();
 const results=await Promise.allSettled([store.create('Alice'),store.create('alice')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(store.list().length,2);
 await store.create('Bob');assert.equal(store.list().length,3);
});
test('invalid profile index fails without overwriting the original file',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'windcloud-profiles-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const data=JSON.stringify([{id:'default',name:'預設角色'},{id:'../../elsewhere',name:'bad'}]);await fs.writeFile(path.join(root,'profiles.json'),data);
 const store=new ProfileStore(root);await assert.rejects(store.load());assert.equal(await fs.readFile(path.join(root,'profiles.json'),'utf8'),data);
});
test('shared capture names deduplicate identical content and preserve distinct text',()=>{
 const shared=new SharedCaptures();const one=shared.append('chat','same');assert.equal(shared.append('chat','same'),null);
 shared.append('chat','different');shared.append('other','same');assert.deepEqual(shared.snapshot('chat').lines,['same','different']);assert.deepEqual(shared.snapshot('other').lines,['same']);
 one.lines.push('external mutation');assert.equal(shared.snapshot('chat').lines.length,2);
});
test('independent engines share capture records but never trigger each other',()=>{
 const shared=new SharedCaptures(),sentA=[],sentB=[];
 const a=new Engine({send:s=>sentA.push(s),capture:({target,line})=>shared.append(target,line)});
 const b=new Engine({send:s=>sentB.push(s),capture:({target,line})=>shared.append(target,line)});
 a.execute('#CAP news shared;#TRIGGER news {say A}');b.execute('#CAP news shared;#TRIGGER news {say B}');
 a.receive('news hello');assert.deepEqual(sentA,['say A']);assert.deepEqual(sentB,[]);
 b.receive('news hello');assert.deepEqual(sentB,['say B']);assert.deepEqual(shared.snapshot('shared').lines,['news hello']);
 a.execute('#VAR n 1;#ALIAS mine look');assert.equal(b.variables.n,undefined);assert.equal(b.aliases.length,0);
});
test('shared archive bounds retention, permits evicted text again and clears globally',()=>{
 const shared=new SharedCaptures({maxTargets:1,maxLines:2,maxCharacters:100});shared.append('a','one');shared.append('a','two');shared.append('a','three');
 assert.deepEqual(shared.snapshot('a').lines,['two','three']);assert(shared.append('a','one'));
 const old=shared.snapshot('a').version;assert.throws(()=>shared.append('b','x'),/上限/);
 const cleared=shared.clear('a');assert(cleared.version>old);assert.deepEqual(cleared.lines,[]);assert(shared.append('b','x'));assert(shared.snapshot('b').version>cleared.version);
});
