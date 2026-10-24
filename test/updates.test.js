import test from 'node:test';
import assert from 'node:assert/strict';
import {compareVersions,selectUpdate,checkForUpdate,RELEASES_API} from '../src/updates.js';
const release=(tag,extra={})=>({tag_name:tag,html_url:'https://github.com/eofnight/Windcloud/releases/tag/'+tag,assets:[{name:'client.dmg'}],draft:false,prerelease:true,...extra});
test('version comparison is numeric, handles prereleases and rejects malformed tags',()=>{
  assert.equal(compareVersions('v0.3.10','0.3.9'),1);assert.equal(compareVersions('1.0.0','1.0.0-rc.1'),1);assert.equal(compareVersions('1.0.0-rc.10','1.0.0-rc.2'),1);assert.equal(compareVersions('0.3.3','0.3.3'),0);
  for(const bad of ['main','v0.3','1.2.3-','1.2.3-rc..1','1.2.3-01'])assert.equal(compareVersions(bad,'0.3.3'),null);
});
test('selects the newest installable release including this project preview channel',()=>{
  assert.deepEqual(selectUpdate([release('v0.3.4'),release('v0.3.10'),release('v0.3.9')],'0.3.3'),{version:'v0.3.10',url:'https://github.com/eofnight/Windcloud/releases/tag/v0.3.10'});
});
test('no reminder for same/older versions, drafts, empty releases or untrusted links',()=>{
  assert.equal(selectUpdate([release('v0.3.3'),release('v0.3.2'),release('v0.4.0',{draft:true}),release('v0.5.0',{assets:[]}),release('v9.0.0',{html_url:'https://evil.example/download'})],'0.3.3'),null);
  assert.throws(()=>selectUpdate({},'0.3.3'),/格式/);
});
test('update request uses only public release metadata, a timeout and no player settings',async()=>{
  let requested;const result=await checkForUpdate('0.3.3',{fetch:async(url,options)=>{requested={url,options};return {ok:true,json:async()=>[release('v0.3.4')]};}});
  assert.equal(requested.url,RELEASES_API);assert.ok(requested.options.signal instanceof AbortSignal);assert.equal(requested.options.body,undefined);assert.equal(result.version,'v0.3.4');
});
test('network failures and rate limits reject cleanly for the caller to handle',async()=>{
  await assert.rejects(checkForUpdate('0.3.3',{fetch:async()=>({ok:false,status:403})}),/HTTP 403/);
  await assert.rejects(checkForUpdate('0.3.3',{fetch:async()=>{throw Error('offline');}}),/offline/);
});

test('four-part hotfix tags and internal build versions order correctly',()=>{
  assert.equal(compareVersions('v0.3.8.1','0.3.8'),1);
  assert.equal(compareVersions('v0.3.8.1','0.3.8+1'),0);
  assert.equal(compareVersions('v0.3.8.2','0.3.8+1'),1);
  assert.equal(compareVersions('v0.3.9','0.3.8+1'),1);
  assert.equal(selectUpdate([release('v0.3.8.1')],'0.3.8+1'),null);
  assert.equal(selectUpdate([release('v0.3.8.1')],'0.3.8').version,'v0.3.8.1');
});
