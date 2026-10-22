// Source-only visual preview. Does not connect to a game or access player settings.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const banner=await fs.readFile(path.join(root,'test/fixtures/windcloud-banner.txt'),'utf8');
const bridge=`
import {Engine} from '/src/engine.js';
import {normalizePreferences} from '/src/preferences.js';
const listeners=new Map();
const emit=(name,data)=>(listeners.get(name)||[]).forEach(fn=>fn(data));
const engine=new Engine({send:text=>emit('output','預覽指令：'+text+'\\r\\n'),notice:text=>emit('notice',text),capture:data=>emit('capture',data)});
const config=()=>({version:2,host:'windcloud.muds.me',port:443,encoding:'utf8',transport:'websocket',preferences,engine:engine.snapshot(),paused:engine.paused});
let preferences=normalizePreferences();
window.mud={on(name,fn){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);return()=>listeners.set(name,list.filter(x=>x!==fn));},async call(name,data){
 if(name==='init')return config();
 if(name==='resize')return;
 if(name==='preferences'){preferences=normalizePreferences(data);return config();}
 if(name==='rules'){engine.restore(data);return config();}
 if(name==='pause'){engine.paused=data;return data;}
 if(name==='connect'){emit('connection','connected');emit('output','\\x1b[0m'+${JSON.stringify(banner.replaceAll('\n','\r\n'))});return;}
 if(name==='disconnect'){emit('connection','disconnected');return;}
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
