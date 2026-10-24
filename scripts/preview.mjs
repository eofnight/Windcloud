// Source-only visual preview. Does not connect to a game or access player settings.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const banner=await fs.readFile(path.join(root,'test/fixtures/windcloud-banner.txt'),'utf8');
const bridge=`
import {Engine} from '/src/engine.js';
import {SharedCaptures} from '/src/shared-captures.js';
import {normalizePreferences} from '/src/preferences.js';
const listeners=new Map();
const emit=(name,data)=>(listeners.get(name)||[]).forEach(fn=>fn(data));
let connected=false;
const shared=new SharedCaptures();
const engine=new Engine({changed:()=>emit('variable-state',{...engine.variables}),canStartTimers:()=>connected,timerChanged:()=>emit('timer-state',engine.timers.state()),send:text=>emit('output','預覽指令：'+text+'\\r\\n'),notice:text=>emit('notice',text),capture:({target,line})=>{const snapshot=shared.append(target,line);if(snapshot)emit('capture-shared',snapshot);},echo:(text,name)=>emit(name?'timer-echo':'trigger-echo',name?{text,name}:text)});
const config=()=>({version:2,host:'windcloud.muds.me',port:443,encoding:'utf8',transport:'websocket',preferences,engine:engine.snapshot(),paused:engine.paused,timerState:engine.timers.state(),profile:{id:'default',name:'離線預覽'}});
let preferences=normalizePreferences();
window.mud={on(name,fn){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);return()=>listeners.set(name,list.filter(x=>x!==fn));},async call(name,data){
 if(name==='init')return config();
 if(name==='profiles')return [{id:'default',name:'離線預覽',open:true}];
 if(name==='new-window')throw Error('請使用桌面版開啟多角色視窗或角色分頁。');
 if(name==='capture-history')return [...new Set(engine.captures.map(r=>r.target))].map(target=>shared.snapshot(target));
 if(name==='capture-clear'){emit('capture-shared',shared.clear(data));return true;}
 if(name==='check-updates')return new URLSearchParams(location.search).has('update')?{version:'v0.3.8.1',url:'https://github.com/eofnight/Windcloud/releases/tag/v0.3.8.1'}:null;
 if(name==='open-update')return;
 if(name==='resize')return;
 if(name==='preferences'){preferences=normalizePreferences(data);return config();}
 if(name==='rules'){engine.restore(data,{preserveTimers:true});return config();}
 if(name==='timer-control'){engine.timers.control(data.enabled,data.name);return config();}
 if(name==='pause'){engine.paused=data;return data;}
 if(name==='connect'){engine.timers.stopAll();engine.cancelPending();connected=true;emit('connection','connected');emit('output','\\x1b[0m'+${JSON.stringify(banner.replaceAll('\n','\r\n'))});return;}
 if(name==='disconnect'){connected=false;engine.timers.stopAll();engine.cancelPending();emit('connection','disconnected');return;}
 if(name==='execute'){if(!data.secret){emit('command-echo',data.text);engine.execute(data.text);}return{config:config(),secret:!!data.secret};}
 return false;
}};
await import('/src/renderer.js');
`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.otf':'font/otf'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.writeHead(302,{Location:'/src/index.html'});res.end();return;}
  if(url.pathname==='/preview-entry.js'){res.writeHead(200,{'Content-Type':types['.js']});res.end(bridge);return;}
  const pathname=decodeURIComponent(url.pathname),file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!/^\/(?:src\/|node_modules\/@xterm\/)/.test(pathname)){res.writeHead(404);res.end();return;}
  let data=await fs.readFile(file);
  if(pathname==='/src/index.html')data=Buffer.from(data.toString().replace('src="renderer.js"','src="/preview-entry.js"'));
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.WINDCLOUD_PREVIEW_PORT||18881),'127.0.0.1',()=>console.log('Source preview: http://127.0.0.1:'+server.address().port));
