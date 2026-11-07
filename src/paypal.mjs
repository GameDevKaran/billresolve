import {randomUUID} from 'node:crypto';
import {invoice,usd,cents,fail} from './domain.mjs';
const base='https://api-m.sandbox.paypal.com';
const id=v=>{if(typeof v!=='string'||!/^INV2-[A-Z0-9-]{4,60}$/.test(v))fail('INVALID_PROVIDER_ID','Invalid Sandbox invoice ID.',400);return v;};
function link(v){if(!v)return null;const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||u.port||!['www.sandbox.paypal.com','sandbox.paypal.com'].includes(u.hostname))fail('UNSAFE_LINK','Provider returned a non-Sandbox invoice link.');return u.href;}
export function invoiceBody(data,{number,merchant,buyer,predecessor=null}){
 const inv=invoice(data);if(!/^BR-[a-f0-9]{12}-[01]$/.test(number))fail('INVALID_NUMBER','Invalid application invoice number.');
 return{detail:{invoice_number:number,currency_code:'USD',payment_term:{term_type:'DUE_ON_RECEIPT'},note:predecessor?`Sandbox correction superseding ${id(predecessor)}. Both demo roles reviewed the exact revision.`:'BillResolve authored Sandbox invoice. Fictional services; no real-world debt.'},
  invoicer:{email_address:merchant,business_name:'BillResolve Demo Studio'},primary_recipients:[{billing_info:{email_address:buyer}}],
  items:inv.items.map(i=>({name:i.name,description:`BillResolve line ${i.id}`,quantity:String(i.quantity),unit_amount:{currency_code:'USD',value:usd(i.unitCents)},...(i.taxBps?{tax:{name:'User supplied tax',percent:usd(i.taxBps)}}:{})})),
  configuration:{tax_calculated_after_discount:false,tax_inclusive:false,allow_tip:false,partial_payment:{allow_partial_payment:false}},
  ...(inv.discountCents?{amount:{breakdown:{discount:{invoice_discount:{amount:{currency_code:'USD',value:usd(inv.discountCents)}}}}}}:{})};
}
export function normalizeInvoice(raw){
 if(!raw||raw.detail?.currency_code!=='USD'||raw.amount?.currency_code!=='USD'||!Array.isArray(raw.items)||typeof raw.status!=='string')fail('PAYPAL_PROTOCOL','Unsupported provider invoice shape.',502);
 const payment=raw.payments;
 return{id:id(raw.id),status:raw.status,invoiceNumber:raw.detail.invoice_number,currency:'USD',totalCents:cents(raw.amount.value),
  items:raw.items.map(i=>({name:i.name,quantity:Number(i.quantity),unitCents:i.unit_amount?.currency_code==='USD'?cents(i.unit_amount.value):null,taxBps:i.tax?.percent?cents(i.tax.percent):0})),
  buyerUrl:link(raw.detail?.metadata?.recipient_view_url),paidAmountCents:payment?.paid_amount?.currency_code==='USD'?cents(payment.paid_amount.value):0,
  payments:(payment?.transactions||[]).map(p=>({type:p.type,method:p.method,paymentId:p.payment_id,amountCents:p.amount?.currency_code==='USD'?cents(p.amount.value):null})),execution:'paypal_sandbox_http'};
}
/** Isolated Sandbox transport. It has no production, refund or mark-paid API. */
export class InvoicePayPal{
 execution='paypal_sandbox_http';#client;#secret;#token;#until=0;#fetch;#merchant;#buyer;
 constructor({clientId,clientSecret,merchant,buyer,fetchImpl=fetch,apiBase=base}={}){if(apiBase!==base||!clientId||!clientSecret)throw Error('Sandbox client configuration required');for(const email of [merchant,buyer])if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw Error('Configured Sandbox merchant and buyer required');if(merchant===buyer)throw Error('Use separate Sandbox buyer and merchant');this.#client=clientId;this.#secret=clientSecret;this.#merchant=merchant;this.#buyer=buyer;this.#fetch=fetchImpl;}
 async #request(path,{method='GET',body,oauth=false}={}){
  if(!oauth&&(!this.#token||Date.now()>=this.#until)){const t=await this.#request('/v1/oauth2/token',{method:'POST',body:'grant_type=client_credentials',oauth:true});if(typeof t?.access_token!=='string'||!Number.isFinite(t.expires_in))fail('PAYPAL_PROTOCOL','Invalid authentication response.',502);this.#token=t.access_token;this.#until=Date.now()+Math.max(0,t.expires_in-60)*1000;}
  try{
   const r=await this.#fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:oauth?`Basic ${Buffer.from(this.#client+':'+this.#secret).toString('base64')}`:`Bearer ${this.#token}`,Accept:'application/json','Content-Type':oauth?'application/x-www-form-urlencoded':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:oauth?body:JSON.stringify(body)});
   if(!r.ok){await r.body?.cancel();fail('PAYPAL_HTTP',`Sandbox invoice request failed (HTTP ${r.status}). Read provider state before retrying.`,502);}
   const chunks=[];let size=0;for await(const chunk of r.body||[]){size+=chunk.length;if(size>200000)fail('PAYPAL_RESPONSE_LIMIT','Provider response is too large.',502);chunks.push(chunk);}if(!size)return null;
   return JSON.parse(Buffer.concat(chunks).toString());
  }catch(e){if(e.code?.startsWith('PAYPAL'))throw e;fail('PAYPAL_UNCERTAIN','Sandbox request did not complete reliably. Do not repeat an unresolved invoice creation.',502);}
 }
 async create(data,options){const raw=await this.#request('/v2/invoicing/invoices',{method:'POST',body:invoiceBody(data,{...options,merchant:this.#merchant,buyer:this.#buyer})});
  let invoiceId=raw?.id;
  if(!invoiceId&&raw?.href){const u=new URL(raw.href);if(u.origin!==base||!/^\/v2\/invoicing\/invoices\/INV2-[A-Z0-9-]+$/.test(u.pathname)||u.search||u.hash)fail('PAYPAL_PROTOCOL','Invalid draft resource link.',502);invoiceId=u.pathname.split('/').at(-1);}
  return{id:id(invoiceId)};
 }
 async get(invoiceId){return normalizeInvoice(await this.#request('/v2/invoicing/invoices/'+id(invoiceId)));}
 async send(invoiceId){await this.#request(`/v2/invoicing/invoices/${id(invoiceId)}/send`,{method:'POST',body:{send_to_invoicer:false,send_to_recipient:false,additional_recipients:[]}});}
 async cancel(invoiceId){await this.#request(`/v2/invoicing/invoices/${id(invoiceId)}/cancel`,{method:'POST',body:{send_to_invoicer:false,send_to_recipient:false,additional_recipients:[]}});}
}
export class MockInvoices{
 execution='local_invoice_test_double';constructor(snapshot=[]){this.records=new Map(snapshot);}
 exportState(){return[...this.records];}
 async create(data,{number}){const key='INV2-'+randomUUID().replaceAll('-','').toUpperCase();const v=invoice(data);this.records.set(key,{id:key,status:'DRAFT',invoiceNumber:number,currency:'USD',totalCents:v.totalCents,items:v.items,buyerUrl:null,paidAmountCents:0,payments:[],execution:this.execution});return{id:key};}
 async get(key){if(!this.records.has(key))fail('FIXTURE_MISSING','Local fixture invoice not found.');return structuredClone(this.records.get(key));}
 async send(key){const v=await this.get(key);if(v.status==='SENT')return;if(v.status!=='DRAFT')fail('FIXTURE_STATE','Only a draft can be sent.');v.status='SENT';this.records.set(key,v);}
 async cancel(key){const v=await this.get(key);if(v.status==='CANCELLED')return;if(v.status!=='SENT')fail('FIXTURE_STATE','Only an unpaid invoice can be cancelled.');v.status='CANCELLED';this.records.set(key,v);}
 async simulatePayment(key){const v=await this.get(key);if(v.status!=='SENT')fail('FIXTURE_STATE','Only an issued local invoice can be paid.');v.status='PAID';v.paidAmountCents=v.totalCents;v.payments=[{type:'LOCAL_FIXTURE',paymentId:'SIMULATED',amountCents:v.totalCents}];this.records.set(key,v);}
}
