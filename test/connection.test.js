import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import net from 'node:net';
import {WebSocketServer} from 'ws';
import {GameConnection,connectionPlan} from '../src/connection.js';
const listen=async server=>{server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;};
const cleanup=(t,server)=>t.after(()=>new Promise(resolve=>server.close(resolve)));
const tcp=(port)=>({kind:'telnet',host:'127.0.0.1',port,encoding:'big5',label:`Telnet 127.0.0.1:${port}`});
const web=(port)=>({kind:'websocket',url:`ws://127.0.0.1:${port}`,origin:'https://windcloud.muds.me',encoding:'utf8',label:'WSS local test'});
function client(t,attempts,timeout=500){const c=new GameConnection({}, {attempts,timeout});t.after(()=>c.destroy());return c;}
test('automatic fallback only applies to the known Windcloud Telnet endpoint',()=>{
 const plan=connectionPlan({host:'125.228.186.144',port:8000,transport:'auto'});assert.deepEqual(plan.map(p=>p.kind),['telnet','websocket']);assert.equal(plan[1].url,'wss://windcloud.muds.me/websocket/');assert.equal(plan[1].encoding,'utf8');
 assert.equal(connectionPlan({host:'127.0.0.1',port:8000,transport:'auto'}).length,1);
 assert.equal(connectionPlan({host:'125.228.186.144',port:8888,transport:'auto'}).length,1);
 assert.equal(connectionPlan({host:'windcloud.muds.me',port:8000,transport:'telnet'}).length,1);
 assert.equal(connectionPlan({host:'windcloud.muds.me',port:8000,transport:'websocket'})[0].kind,'websocket');
 assert.throws(()=>connectionPlan({host:'elsewhere.example',port:8000,transport:'websocket'}),/僅適用/);
});
test('TCP path keeps byte streams intact', {timeout:3000},async t=>{
 const server=net.createServer(socket=>{socket.on('error',()=>{});socket.on('data',data=>socket.write(data));});
 const port=await listen(server);cleanup(t,server);
 const c=client(t,[tcp(port)]);c.connect();await once(c,'connect');assert.equal(c.kind,'telnet');
 const received=once(c,'data');c.write(Buffer.from([0xa4,0xa4,0xff,0xff]));assert.deepEqual((await received)[0],Buffer.from([0xa4,0xa4,0xff,0xff]));c.destroy();
});
test('WebSocket sends the required Origin, UTF-8 text commands and binary negotiation', {timeout:3000},async t=>{
 const server=new WebSocketServer({host:'127.0.0.1',port:0,verifyClient:info=>info.origin==='https://windcloud.muds.me'});await once(server,'listening');cleanup(t,server);
 const received=[];server.on('connection',socket=>socket.on('message',(data,binary)=>{received.push({text:data.toString(),binary});socket.send(Buffer.from('風雲再起'));}));
 const c=client(t,[web(server.address().port)]);c.connect();await once(c,'connect');assert.equal(c.encoding,'utf8');
 let response=once(c,'data');c.sendText('看');assert.equal((await response)[0].toString(),'風雲再起');assert.deepEqual(received[0],{text:'看\n',binary:false});
 response=once(c,'data');c.write(Buffer.from([255,254,201]));await response;assert.equal(received[1].binary,true);c.destroy();
});
test('a failed direct connection falls back once without a premature close or error', {timeout:3000},async t=>{
 const unused=net.createServer();const unavailable=await listen(unused);await new Promise(resolve=>unused.close(resolve));
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await once(server,'listening');cleanup(t,server);
 const c=client(t,[tcp(unavailable),web(server.address().port)]),fallbacks=[],errors=[];let closed=0;
 c.on('fallback',message=>fallbacks.push(message));c.on('error',e=>errors.push(e));c.on('close',()=>closed++);
 c.connect();await once(c,'connect');assert.equal(c.kind,'websocket');assert.equal(fallbacks.length,1);assert.match(fallbacks[0],/Telnet.*改試 WSS/);assert.equal(errors.length,0);assert.equal(closed,0);c.destroy();assert.equal(closed,1);
});
test('handshake timeout identifies the failed endpoint and closes exactly once', {timeout:3000},async t=>{
 const clients=new Set();const server=net.createServer(socket=>{clients.add(socket);socket.on('error',()=>{});socket.on('close',()=>clients.delete(socket));});
 const port=await listen(server);t.after(()=>{for(const s of clients)s.destroy();server.close();});
 const c=client(t,[web(port)],60);let closed=0;c.on('close',()=>closed++);
 const failure=once(c,'error');c.connect();const [error]=await failure;assert.match(error.message,/WSS local test/);assert.equal(c.destroyed,true);assert.equal(closed,1);
});
test('user cancellation prevents fallback and further connection attempts', {timeout:3000},async t=>{
 const server=net.createServer(socket=>{socket.on('error',()=>{});});const port=await listen(server);cleanup(t,server);
 const c=client(t,[tcp(port),web(port)]),attempts=[];c.on('attempt',a=>attempts.push(a));c.connect();await once(c,'connect');c.destroy();assert.equal(attempts.length,1);assert.equal(c.destroyed,true);
});
