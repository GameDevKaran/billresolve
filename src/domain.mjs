import {createHash} from 'node:crypto';
export const fail=(code,message,httpStatus=409)=>{throw Object.assign(Error(message),{code,httpStatus});};
const integer=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail('INVALID_INPUT',`${label} must be an integer from ${min} to ${max}.`,400);return v;};
const text=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('INVALID_INPUT',`Provide ${label} within ${max} characters.`,400);return v.trim();};
export const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const usd=n=>(n/100).toFixed(2);
export function cents(v){if(typeof v!=='string'||!/^\d{1,6}(\.\d{1,2})?$/.test(v))fail('INVALID_MONEY','Enter a nonnegative USD amount with at most two decimal places.',400);const [a,b='']=v.split('.');return integer(Number(a)*100+Number(b.padEnd(2,'0')),0,1000000,'USD cents');}
export function invoice(input){
 if(!input||input.currency!=='USD'||!Array.isArray(input.items)||input.items.length<1||input.items.length>10)fail('INVALID_INVOICE','Use USD and one to ten invoice lines.',400);
 const ids=new Set();const items=input.items.map(i=>{const id=text(i.id,40,'line ID');if(!/^[a-zA-Z0-9_-]+$/.test(id)||ids.has(id))fail('INVALID_INVOICE','Line IDs must be unique safe identifiers.',400);ids.add(id);return{id,name:text(i.name,100,'line name'),quantity:integer(i.quantity,1,100,'quantity'),unitCents:integer(i.unitCents,0,1000000,'unit cents'),taxBps:integer(i.taxBps??0,0,2500,'tax basis points')};});
 const subtotal=items.reduce((n,i)=>n+i.unitCents*i.quantity,0),tax=items.reduce((n,i)=>n+Math.floor((i.unitCents*i.quantity*i.taxBps+5000)/10000),0);
 const discountCents=integer(input.discountCents??0,0,subtotal,'invoice discount');const totalCents=subtotal+tax-discountCents;integer(totalCents,1,1000000,'total cents');
 return{currency:'USD',items,discountCents,subtotalCents:subtotal,taxCents:tax,totalCents};
}
export const SAMPLE={currency:'USD',items:[{id:'design',name:'Landing page design',quantity:1,unitCents:6000,taxBps:0},{id:'revision',name:'Revision sessions',quantity:2,unitCents:4000,taxBps:0},{id:'handoff',name:'Deployment handoff',quantity:1,unitCents:4000,taxBps:0}],discountCents:0};
export const EVIDENCE=[{id:'E1',lineId:'design',title:'Design acceptance',text:'The customer approved the landing page design on November 4.'},{id:'E2',lineId:'revision',title:'Revision work log',text:'One revision session was completed on November 5. A second session has not been documented.'},{id:'E3',lineId:'handoff',title:'Handoff checklist',text:'A deployment guide was prepared. Customer receipt of the handoff is not recorded.'}];
export function createCase(id){return{id,status:'draft',original:invoice(SAMPLE),evidence:structuredClone(EVIDENCE),question:null,analysis:null,revision:null,revisionNumber:0,approvals:{},originalProvider:null,replacementProvider:null,operation:null,history:[],createdAt:new Date().toISOString()};}
export function event(s,type,detail={}){s.history.push({at:new Date().toISOString(),type,...detail});}
export function editable(s){if(s.operation||['paid','issued','blocked_paid'].includes(s.status))fail('LOCKED','This invoice is being issued or has a final outcome. Read provider state before any further change.');if(!s.originalProvider||!['SENT','SHARED','UNPAID'].includes(s.originalProvider.status))fail('UNPAID_REQUIRED','Load an authored unpaid Sandbox invoice first.');}
export function ask(s,input){editable(s);const line=s.original.items.find(x=>x.id===input.lineId);if(!line)fail('UNKNOWN_LINE','Choose a line on this invoice.',400);s.question={lineId:line.id,text:text(input.text,1200,'question')};s.analysis=null;s.revision=null;s.approvals={};event(s,'buyer_questioned_line',{lineId:line.id});}
export function validateAnalysis(value,s){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['summary','citations','missing'].includes(k)))fail('AI_INVALID_OUTPUT','The explanation schema was invalid. No invoice was changed.',422);
 const summary=text(value.summary,800,'evidence summary');if(!Array.isArray(value.citations)||value.citations.length>6||!Array.isArray(value.missing)||value.missing.length>4)fail('AI_INVALID_OUTPUT','The explanation must include bounded citations and missing facts.',422);
 const citations=value.citations.map(c=>{const e=s.evidence.find(e=>e.id===c.id&&e.lineId===s.question.lineId);if(!e||typeof c.quote!=='string'||!c.quote.trim()||c.quote.length>500||!e.text.includes(c.quote)||Object.keys(c).some(k=>!['id','quote'].includes(k)))fail('AI_UNGROUNDED','A citation did not match the supplied evidence. No invoice was changed.',422);return{id:e.id,quote:c.quote};});
 return{summary,citations,missing:value.missing.map(v=>text(v,300,'missing fact'))};
}
export function revise(s,input){editable(s);if(!s.question||!s.analysis)fail('REVIEW_REQUIRED','Question a line and review its evidence first.');const proposed=invoice(input);if(proposed.items.length!==s.original.items.length||proposed.items.some((i,k)=>i.id!==s.original.items[k].id||i.name!==s.original.items[k].name))fail('LINE_IDENTITY','Keep the original line identities for this correction.');s.revisionNumber++;s.revision={...proposed,number:s.revisionNumber,reason:text(input.reason,600,'correction reason')};s.approvals={};s.status='reviewing';event(s,'revision_prepared',{revision:s.revisionNumber,totalCents:s.revision.totalCents});}
export function terms(s){if(!s.revision)fail('NO_REVISION','Prepare a correction first.');return digest({original:s.originalProvider.id,question:s.question,evidence:s.evidence,revision:s.revision});}
export function approve(s,{role,termsHash}){editable(s);if(!['merchant','buyer'].includes(role)||termsHash!==terms(s))fail('STALE_APPROVAL','Approval must match the exact current revision.');s.approvals[role]={termsHash,at:new Date().toISOString()};event(s,'revision_approved',{role,revision:s.revision.number});}
export function ready(s){editable(s);const h=terms(s);if(!['merchant','buyer'].every(r=>s.approvals[r]?.termsHash===h))fail('APPROVALS_REQUIRED','Both demo roles must approve the exact current revision before issue.');return h;}
export function verifyInvoice(proof,expected,number){
 if(!proof||proof.invoiceNumber!==number||proof.currency!=='USD'||proof.totalCents!==expected.totalCents||proof.items.length!==expected.items.length)fail('INVOICE_MISMATCH','Provider invoice number, amount or line count does not match the reviewed invoice.');
 for(let n=0;n<expected.items.length;n++){const a=proof.items[n],b=expected.items[n];if(a.name!==b.name||a.quantity!==b.quantity||a.unitCents!==b.unitCents||a.taxBps!==b.taxBps)fail('INVOICE_MISMATCH','Provider line terms differ from the reviewed invoice.');}
 return proof;
}
