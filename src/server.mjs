import http from 'node:http';import {readFile} from 'node:fs/promises';import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';import {pathToFileURL} from 'node:url';
import * as d from './domain.mjs';import {SqliteStore,GcsStore,serialQueue} from './store.mjs';import {InvoicePayPal,MockInvoices} from './paypal.mjs';import {EvidenceAI} from './ai.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(),microphone=(),geolocation=()', 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
const files=new Map([['/',['index.html','text/html']],['/app.js',['app.js','text/javascript']],['/styles.css',['styles.css','text/css']]]);
function identity(req){const value=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('billresolve='))?.slice(12);const m=/^([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(value||'');return m?{id:m[1],secret:m[2]}:null;}
async function body(req){let n=0,a=[];for await(const c of req){n+=c.length;if(n>64000)d.fail('BODY_LIMIT','Request too large.',413);a.push(c);}try{const v=JSON.parse(Buffer.concat(a).toString()||'{}');if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v;}catch{d.fail('INVALID_JSON','A JSON object is required.',400);}}
export function createApp({store=new SqliteStore(),paypal=null,ai=new EvidenceAI(),maxAiCalls=0,origin='http://127.0.0.1:8803'}={}){
 const u=new URL(origin);if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))throw Error('Explicit secure or localhost origin required');origin=u.origin;
 if(!Number.isSafeInteger(maxAiCalls)||maxAiCalls<0||maxAiCalls>1000)throw Error('Invalid model request allowance');
 const queue=serialQueue(),rates=new Map();
 const view=r=>({case:r?.state||null,termsHash:r?.state.revision?d.terms(r.state):null,integration:{paypal:paypal?.execution||'local_invoice_test_double',ai:ai.execution,liveVerified:false}});
 const send=(res,status,v,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(v));};
 async function load(who){if(!who)return null;const r=await store.read(who.id);if(!r||typeof r.value.authHash!=='string'||r.value.authHash.length!==64||!timingSafeEqual(Buffer.from(r.value.authHash,'hex'),Buffer.from(hash(who.secret),'hex')))d.fail('SESSION_MISSING','This private session is unavailable.',401);return r;}
 const number=(s,replacement)=>'BR-'+s.id.replaceAll('-','').slice(0,12)+'-'+(replacement?'1':'0');
 async function readback(s,pay){
  if(s.originalProvider){const proof=await pay.get(s.originalProvider.id);if(proof.id!==s.originalProvider.id)d.fail('INVOICE_MISMATCH','Provider returned a different original invoice.');s.originalProvider=d.verifyInvoice(proof,s.original,number(s,false));}
  if(s.replacementProvider){const proof=await pay.get(s.replacementProvider.id);if(proof.id!==s.replacementProvider.id)d.fail('INVOICE_MISMATCH','Provider returned a different replacement invoice.');s.replacementProvider=d.verifyInvoice(proof,s.revision,number(s,true));
   if(proof.status==='PAID'){s.status='paid';if(!s.history.some(x=>x.type==='invoice_paid_readback'))d.event(s,'invoice_paid_readback',{invoiceId:proof.id,paidAmountCents:proof.paidAmountCents,paymentTypes:proof.payments.map(p=>p.type)});}
  }else if(s.originalProvider&&['PAID','PARTIALLY_PAID','PAYMENT_PENDING','MARKED_AS_PAID'].includes(s.originalProvider.status)){s.status='blocked_paid';s.approvals={};}
 }
 async function drive(s,pay,save,write){
  if(!s.operation)return;const op=s.operation;
  for(let i=0;i<5;i++){
   const replacement=op.kind==='replace',target=replacement?'replacementProvider':'originalProvider';
   if(op.stage==='cancel'){
    await readback(s,pay);await save();
    if(s.originalProvider.status==='CANCELLED'){op.stage='create';op.attempted=false;d.event(s,'original_cancelled_readback',{invoiceId:s.originalProvider.id});await save();continue;}
    if(!['SENT','UNPAID'].includes(s.originalProvider.status)||s.originalProvider.paidAmountCents!==0)d.fail('ORIGINAL_NOT_UNPAID','Original invoice is no longer wholly unpaid. No replacement was issued.');
    if(op.attempted)d.fail('PROVIDER_UNRESOLVED','Cancellation outcome remains unresolved. Read provider state; do not issue a second invoice.');
    if(!write)return;op.attempted=true;await save();await pay.cancel(s.originalProvider.id);continue;
   }
   if(op.stage==='create'){
    if(s[target]){op.stage='send';op.attempted=false;await save();continue;}
    if(op.attempted)d.fail('CREATE_UNRESOLVED',`The draft creation response is unresolved. Review Sandbox invoice number ${number(s,replacement)} before any manual recovery; this app will not create a duplicate.`);
    if(!write)return;op.attempted=true;await save();const created=await pay.create(replacement?s.revision:s.original,{number:number(s,replacement),predecessor:replacement?s.originalProvider.id:null});s[target]={id:created.id};await save();op.stage='send';op.attempted=false;await save();continue;
   }
   if(op.stage==='send'){
    await readback(s,pay);await save();const proof=s[target];
    if(['SENT','UNPAID','PAID'].includes(proof.status)){s.status=proof.status==='PAID'?'paid':replacement?'issued':'reviewing';s.operation=null;d.event(s,replacement?'replacement_issued_readback':'original_issued_readback',{invoiceId:proof.id,totalCents:proof.totalCents});await save();return;}
    if(proof.status!=='DRAFT')d.fail('INVOICE_NOT_DRAFT','Invoice state does not permit issuing this prepared draft.');
    if(op.attempted)d.fail('SEND_UNRESOLVED','Issue request is unresolved. Read provider state before further changes.');
    if(!write)return;op.attempted=true;await save();await pay.send(proof.id);continue;
   }
  }
  d.fail('RECONCILE_REQUIRED','Read provider state to finish the prepared operation.');
 }
 const server=http.createServer(async(req,res)=>{let record=null;try{
  const path=new URL(req.url,origin).pathname;
  if(req.method==='GET'&&files.has(path)){const [name,type]=files.get(path);res.writeHead(200,{...headers,'Content-Type':type+'; charset=utf-8'});res.end(await readFile(new URL('../public/'+name,import.meta.url)));return;}
  if(req.method==='GET'&&path==='/health'){send(res,200,{ok:true,app:'BillResolve',mode:paypal?'sandbox':'mock'});return;}
  const who=identity(req);
  if(req.method==='GET'&&['/api/session','/api/export'].includes(path)){record=(await load(who))?.value;if(path==='/api/export'&&!record)d.fail('NO_SESSION','Start a case first.',401);send(res,200,view(record),path==='/api/export'?{'Content-Disposition':'attachment; filename="billresolve-record.json"'}:{});return;}
  if(req.method!=='POST'||!path.startsWith('/api/'))d.fail('NOT_FOUND','Not found.',404);
  if(req.headers.origin!==origin||!String(req.headers['content-type']||'').startsWith('application/json'))d.fail('ORIGIN_REQUIRED','Use the same-origin application.',403);
  const input=await body(req),rateKey=who?.id||req.socket.remoteAddress,minute=Math.floor(Date.now()/60000),prior=rates.get(rateKey);const count=prior?.minute===minute?prior.count+1:1;if(rates.size>2000)rates.clear();rates.set(rateKey,{minute,count});if(count>50)d.fail('RATE_LIMIT','Please wait a minute before retrying.',429);
  await queue(who?.id||rateKey,async()=>{
   let row=await load(who);record=row?.value;
   if(path==='/api/new'){
    if(record?.state.operation||(record?.state.originalProvider&&record.state.status!=='paid'))d.fail('UNSETTLED_CASE','Preserve the active or unresolved invoice until its current workflow is resolved.');
    const caseId=randomUUID(),secret=randomBytes(32).toString('hex');record={state:d.createCase(caseId),authHash:hash(secret)};await store.write(caseId,record);send(res,201,view(record),{'Set-Cookie':`billresolve=${caseId}.${secret}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${u.protocol==='https:'?'; Secure':''}`});return;
   }
   if(!record)d.fail('NO_CASE','Start a case first.',401);const s=record.state,pay=paypal||new MockInvoices(record.mockProvider);let version=row.version;
   const save=async()=>{if(pay.execution==='local_invoice_test_double')record.mockProvider=pay.exportState();version=await store.write(s.id,record,version);};
   try{
    if(path==='/api/original'){
     if(!s.operation&&!s.originalProvider){s.operation={kind:'original',stage:'create',attempted:false};d.event(s,'original_prepared');await save();}
     if(s.operation?.kind==='replace')d.fail('WRONG_OPERATION','Continue the prepared replacement instead.');await drive(s,pay,save,true);
    }else if(path==='/api/question'){d.ask(s,input);await save();}
    else if(path==='/api/analyze'){
     d.editable(s);if(!s.question)d.fail('NO_QUESTION','Choose a questioned line first.');
     if(ai.mode==='live')await queue('ai_calls',async()=>{const n=await store.read('ai_calls');if((n?.value.count||0)>=maxAiCalls)d.fail('AI_LIMIT','The approved model request allowance is exhausted.',429);await store.write('ai_calls',{count:(n?.value.count||0)+1},n?.version||'0');});
     s.analysis=await ai.analyze(s);d.event(s,'evidence_analysis',{execution:s.analysis.execution});await save();
    }else if(path==='/api/revise'){d.revise(s,input);await save();}
    else if(path==='/api/approve'){d.approve(s,input);await save();}
    else if(path==='/api/issue'){
     if(['issued','paid'].includes(s.status)&&!s.operation)return send(res,200,view(record));
     if(!s.operation){await readback(s,pay);await save();const h=d.ready(s);s.operation={kind:'replace',stage:'cancel',attempted:false,termsHash:h};d.event(s,'supersession_prepared',{termsHash:h});await save();}
     if(s.operation.kind!=='replace')d.fail('WRONG_OPERATION','Finish issuing the original invoice first.');await drive(s,pay,save,true);
    }else if(path==='/api/reconcile'){await readback(s,pay);await save();await drive(s,pay,save,false);}
    else if(path==='/api/simulate-payment'){
     if(pay.execution!=='local_invoice_test_double')d.fail('MOCK_ONLY','Actual Sandbox payment must be made by the buyer at PayPal.',403);
     if(s.status!=='issued')d.fail('NOT_ISSUED','Issue the approved replacement before simulating payment.');await pay.simulatePayment(s.replacementProvider.id);await save();await readback(s,pay);await save();
    }else d.fail('NOT_FOUND','Unknown action.',404);
   }catch(e){if(s.operation){s.operation.error=e.code||'UNRESOLVED';d.event(s,'provider_operation_unresolved',{stage:s.operation.stage,code:e.code||'UNRESOLVED'});try{await save();}catch{}}throw e;}
   send(res,200,view(record));
  });
 }catch(e){send(res,e.httpStatus||502,{...view(record),error:{code:e.code||'REQUEST_FAILED',message:e.code?e.message:'The request did not complete. Read stored/provider state before retrying.'}});}});
 server.headersTimeout=10000;server.requestTimeout=30000;return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const e=process.env,mode=e.BILLRESOLVE_PAYPAL_MODE||'mock';if(!['mock','sandbox'].includes(mode)||(e.PAYPAL_ENV&&e.PAYPAL_ENV!=='sandbox'))throw Error('Sandbox or labeled local mode only');
 const store=e.BILLRESOLVE_STORE==='gcs'?new GcsStore({bucket:e.BILLRESOLVE_BUCKET,project:e.GCP_PROJECT_ID}):new SqliteStore(e.BILLRESOLVE_SQLITE_PATH||'.local/billresolve.sqlite');
 const paypal=mode==='sandbox'?new InvoicePayPal({clientId:e.BILLRESOLVE_PAYPAL_CLIENT_ID,clientSecret:e.BILLRESOLVE_PAYPAL_CLIENT_SECRET,merchant:e.BILLRESOLVE_SANDBOX_MERCHANT,buyer:e.BILLRESOLVE_SANDBOX_BUYER}):null;
 const ai=new EvidenceAI({mode:e.BILLRESOLVE_AI_MODE||'mock',baseUrl:e.BILLRESOLVE_AI_BASE_URL,key:e.BILLRESOLVE_AI_KEY,model:e.BILLRESOLVE_AI_MODEL,expiresAt:e.BILLRESOLVE_AI_EXPIRES_AT,approval:e.BILLRESOLVE_AI_APPROVAL});
 const port=Number(e.PORT||8803),origin=e.BILLRESOLVE_ORIGIN||`http://127.0.0.1:${port}`;if(e.K_SERVICE&&(mode!=='sandbox'||e.BILLRESOLVE_STORE!=='gcs'||!e.BILLRESOLVE_ORIGIN?.startsWith('https://')))throw Error('Cloud release requires Sandbox, isolated GCS and explicit HTTPS origin');
 createApp({store,paypal,ai,origin,maxAiCalls:Number(e.BILLRESOLVE_AI_MAX_CALLS||0)}).listen(port,e.K_SERVICE?'0.0.0.0':'127.0.0.1',()=>console.log(`BillResolve ${mode} at ${origin}`));
}
