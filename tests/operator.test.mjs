import {InvoicePayPal} from '../src/paypal.mjs';
const sandbox=()=>new InvoicePayPal({clientId:'fixture-client',clientSecret:'fixture-secret',merchant:'merchant@example.com',buyer:'buyer@example.com',fetchImpl:()=>{throw Error('Unexpected provider request');}});
import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {createApp} from '../src/server.mjs';import {SqliteStore} from '../src/store.mjs';
test('private Sandbox API blocks anonymous mutations, export and forged access before provider calls',async t=>{
 const code='owned-fixture-test-code-32-characters',origin='https://operator.example',app=createApp({store:new SqliteStore(':memory:'),origin,paypal:sandbox(),operatorCode:code});
 app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>{app.closeAllConnections();app.close();});const base='http://127.0.0.1:'+app.address().port;
 const call=(path,value,cookie='')=>fetch(base+path,{method:value===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',cookie},body:value===undefined?undefined:JSON.stringify(value)});
 let r=await call('/api/session');assert.equal((await r.json()).integration.operatorRequired,true);
 for(const path of ['/api/new','/api/analyze','/api/issue','/api/resolve']){r=await call(path,{});assert.equal(r.status,401);assert.equal((await r.json()).error.code,'OPERATOR_REQUIRED');}
 assert.equal((await call('/api/export')).status,401);assert.equal((await call('/api/unlock',{accessCode:'wrong'})).status,401);
 r=await call('/api/unlock',{accessCode:code});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly; SameSite=Strict; Max-Age=3600; Secure/);assert.ok(!cookie.includes(code));
 r=await call('/api/session',undefined,cookie.split(';')[0]);assert.equal((await r.json()).integration.operatorRequired,false);
 r=await call('/api/analyze',{},cookie.split(';')[0]);assert.equal((await r.json()).error.code,'NO_CASE');
 r=await call('/api/analyze',{},cookie.split(';')[0].replace(/.$/,'z'));assert.equal((await r.json()).error.code,'OPERATOR_REQUIRED');
});
test('Sandbox startup refuses missing operator secret; local test mode stays available',()=>{
 assert.throws(()=>createApp({store:new SqliteStore(':memory:'),paypal:sandbox()}),/private operator/);
 const app=createApp({store:new SqliteStore(':memory:')});app.close();
});
