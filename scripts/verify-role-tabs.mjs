// Run against a fresh WINDCLOUD_TEST_PROFILE with Electron CDP :9223 and main inspector :9230.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const mainPath = fileURLToPath(new URL('../src/main.cjs', import.meta.url));
import net from 'node:net';
async function client(port,type='page',targetId) {
 const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 const ws=new WebSocket((targetId?pages.find(p=>p.id===targetId):(pages.find(p=>p.type===type)||pages[0])).webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<100;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout: '+expression);};
 await call('Runtime.enable');return {ws,call,run,wait,errors};
}



const pages=async()=> (await(await fetch('http://127.0.0.1:9223/json/list')).json()).filter(p=>p.type==='page');
async function until(check){for(let n=0;n<100;n++){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('timeout');}
const main=await client('9230','node');
const native=expr=>main.run("(()=>{const electron=process.getBuiltinModule('module').createRequire("+JSON.stringify(mainPath)+") ('electron');return "+expr+"})()");
assert(await main.run("!!process.env.WINDCLOUD_TEST_PROFILE"), 'Use an isolated WINDCLOUD_TEST_PROFILE');
const defaultPage=(await pages()).find(p=>p.url.endsWith('/index.html'));
const first=await client('9223','page',defaultPage.id),clients=[first],sockets=[],received=[];
let server;
try{
 await first.wait("!!window.mud && document.getElementById('profile-name').textContent==='預設角色'");
 // Use the real new-role form for tab and window choices.
 for(let n=1;n<5;n++){
  await first.run(`document.getElementById('new-window').click()`);
  await first.wait("document.getElementById('new-window-dialog').open");
  await first.run(`document.getElementById('window-mode').value=${JSON.stringify(n===4?'window':'tab')};document.getElementById('window-name').value='分頁測試${n}';document.getElementById('new-window-form').requestSubmit()`);
  await first.wait("!document.getElementById('new-window-dialog').open");
  await until(async()=> (await pages()).some(p=>p.title.endsWith('分頁測試'+n)));
  const p=(await pages()).find(p=>p.title.endsWith('分頁測試'+n));const c=await client('9223','page',p.id);
  await c.wait("!!window.mud && document.getElementById('profile-name').textContent.length>0");clients.push(c);
 }
 assert.equal(await native('electron.BrowserWindow.getAllWindows().length'),2);
 assert.deepEqual((await native('electron.BrowserWindow.getAllWindows().map(w=>w.contentView.children.length)')).sort(),[1,4]);
 // Locate first host via tab count (CDP lists newest first).
 const hosts=[];for(const p of (await pages()).filter(p=>p.url.endsWith('/roles.html')))hosts.push(await client('9223','page',p.id));
 const host=(await Promise.all(hosts.map(async h=>({h,count:await h.run("document.querySelectorAll('[role=tab]').length")})))).find(x=>x.count===4).h;
 const ids=await first.run("window.mud.call('profiles')");const id=n=>ids.find(p=>p.name===(n?'分頁測試'+n:'預設角色')).id;
 server=net.createServer(s=>{const i=sockets.length;sockets.push(s);received[i]='';s.on('data',b=>received[i]+=b.toString());});await new Promise(r=>server.listen(18011,'127.0.0.1',r));
 for(let i=0;i<clients.length;i++){
  const c=clients[i];await c.run(`window.mud.call('execute',{text:'#VAR own ${i};#ALIAS who {say ${i}};#CAP ready shared;#TRIGGER ready {say trigger${i}}',secret:false})`);
  await c.run("window.mud.call('connect',{host:'127.0.0.1',port:18011,encoding:'utf8',transport:'telnet'})");await c.wait("document.getElementById('connection-state').textContent==='已連線'");
  await c.run("window.mud.call('execute',{text:'who',secret:false})");await until(()=>received[i].includes('say '+i));
  assert.equal(await c.run("window.mud.call('init').then(c=>c.engine.variables.own)"),String(i));
 }
 // First role is hidden; timers and triggers must continue while another tab is active.
 await first.run("window.mud.call('init').then(c=>window.mud.call('rules',{...c.engine,timers:[{name:'bg',seconds:1,body:'say background',mode:'once'}]})).then(()=>window.mud.call('timer-control',{enabled:true,name:'bg'}))");
 await until(()=>received[0].includes('say background'));
 for(const s of sockets)s.write('ready same across tabs\r\n');
 for(let i=0;i<clients.length;i++){
  await clients[i].wait("window.mud.call('capture-history').then(s=>s[0]?.lines.length===1)");await until(()=>received[i].includes('say trigger'+i));
 }
 // Selecting an already open character from another window focuses its original tab, no duplicate.
 await clients[4].run(`window.mud.call('new-window',{id:${JSON.stringify(id(1))},mode:'tab'})`);
 assert.equal(await native('electron.BrowserWindow.getAllWindows().length'),2);
 await host.wait(`document.querySelector('[role=tab][aria-selected=true]').textContent==='分頁測試1'`);
 // Shell add button opens new role dialog in currently selected role.
 await host.run("document.getElementById('add-role').click()");await clients[1].wait("document.getElementById('new-window-dialog').open");
 await clients[1].run("document.getElementById('cancel-new-window').click()");
 // Switch via actual tab control; close a background role only.
 await host.run(`Array.from(document.querySelectorAll('[role=tab]')).find(b=>b.textContent==='預設角色').click()`);
 await host.wait("document.querySelector('[role=tab][aria-selected=true]').textContent==='預設角色'");
 await host.run("document.querySelector('[aria-label=\"關閉角色 分頁測試2\"]').click()");
 await until(async()=> !(await pages()).some(p=>p.title.endsWith('分頁測試2')));
 for(const i of [0,1,3,4])assert.equal(await clients[i].run("document.getElementById('connection-state').textContent"),'已連線');
 assert.equal(sockets[2].destroyed,true);
 // Reopen closed role in tab; settings and shared archive survive, runtime timers don't resume.
 await first.run(`window.mud.call('new-window',{id:${JSON.stringify(id(2))},mode:'tab'})`);
 const reopenedPage=(await pages()).find(p=>p.title.endsWith('分頁測試2'));const reopened=await client('9223','page',reopenedPage.id);clients.push(reopened);
 await reopened.wait("document.getElementById('profile-name').textContent==='分頁測試2'");
 assert.equal(await reopened.run("window.mud.call('init').then(c=>c.engine.variables.own)"),'2');
 assert.equal(await reopened.run("document.getElementById('connection-state').textContent"),'尚未連線');
 assert.equal(await reopened.run("window.mud.call('capture-history').then(s=>s[0].lines.length)"),1);
 await first.run("window.mud.call('capture-clear','shared')");for(const c of [first,clients[1],clients[3],clients[4],reopened])await c.wait("window.mud.call('capture-history').then(s=>s[0]?.lines.length===0)");
 // Closing first native window closes only its roles; second window remains connected.
 await native("electron.BrowserWindow.getAllWindows().find(w=>w.contentView.children.length===4).close()");
 await until(async()=> await native('electron.BrowserWindow.getAllWindows().length')===1);
 assert.equal(await clients[4].run("document.getElementById('connection-state').textContent"),'已連線');
 for(const c of [...clients,...hosts])assert.deepEqual(c.errors,[]);
 console.log('PASS: four role tabs + separate window, five live independent connections/settings, hidden-role timers/triggers, shared dedup/clear, actual tab select/add/close UI, no duplicate profile, reopen persistence, close-window isolation, no renderer exceptions');
 for(const h of hosts)h.ws.close();
}finally{
 for(const c of clients)c.ws.close();for(const s of sockets)s.destroy();server?.close();
 await native('electron.BrowserWindow.getAllWindows().forEach(w=>w.close())');main.ws.close();
}
