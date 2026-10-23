import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';

const load = async file => (await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../api/' + file, import.meta.url))).toString('base64'))).default;
const generate = await load('generate.js');
const createOrder = await load('create-order.js');
const verify = await load('verify-payment.js');
const webhook = await load('webhook.js');
function response() {
  return { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(s) { this.statusCode=s; return this; }, json(body) { this.body=body; return this; } };
}
const request = body => ({ method: 'POST', headers: {origin: 'https://www.thesoloentrepreneur.in'}, body });
const validMessages = [{role:'user',content:'Suggest a business name.'}];
process.env.NODE_ENV = 'production';
process.env.OPENAI_API_KEY = 'test-only';
process.env.RAZORPAY_KEY_ID = 'test-only';
process.env.RAZORPAY_KEY_SECRET = 'test-only';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-only-webhook';

for (const origin of ['https://thesoloentrepreneur.in.attacker.example', 'https://attacker.example/thesoloentrepreneur.in', 'http://localhost:3000', 'null']) {
  test('reject untrusted origin: '+origin, async () => {
    const req=request({messages:validMessages});req.headers.origin=origin;
    const res=response();await generate(req,res);assert.equal(res.statusCode,403);
  });
}
test('bound AI model, output, and forwarded fields', async t => {
  let payload;
  t.mock.method(globalThis,'fetch',async (url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[],internal:'not returned'})};});
  const res=response();await generate(request({messages:[{...validMessages[0], tool_calls: ['ignored']}],model:'expensive-unapproved-model',max_tokens:100000}),res);
  assert.equal(res.statusCode,200);assert.equal(payload.model,'gpt-4o-mini');assert.equal(payload.max_tokens,1500);
  assert.deepEqual(payload.messages,validMessages);assert.deepEqual(res.body,{choices:[]});
});
test('reject malformed and oversized generation input before fetch', async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('must not fetch');});
  for(const body of [null,[],{}, {messages:[]},{messages:[{role:'user',content:'x'.repeat(8001)}]},{messages:validMessages,temperature:'1'},{messages:[{role:'tool',content:'x'}]}]) {
    const res=response();await generate(request(body),res);assert.equal(res.statusCode,400);
  }
  assert.equal(calls,0);
});
test('provider errors do not reach the browser',async t=>{
  t.mock.method(globalThis,'fetch',async()=>{throw Error('sensitive diagnostic');});
  const res=response();await generate(request({messages:validMessages}),res);
  assert.equal(res.statusCode,502);assert.ok(!JSON.stringify(res.body).includes('sensitive'));
});
test('server price and identity cannot be replaced by caller values',async t=>{
  let payload;t.mock.method(globalThis,'fetch',async(url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({id:'order_test'})};});
  const res=response();await createOrder(request({plan:'annual',name:'Test',email:'test@example.com',amount:1,user_id:'another-user'}),res);
  assert.equal(res.statusCode,200);assert.equal(payload.amount,1249900);assert.equal(payload.notes.user_id,'');
});
test('every product the products page sells can be checked out at its listed price',async t=>{
  // Guards the regression where pricing moved server-side but only the
  // membership plans were added, so every products-page checkout returned "Invalid plan".
  const page=readFileSync(new URL('../products.html',import.meta.url),'utf8');
  const block=page.slice(page.indexOf('const PRODUCTS = {'),page.indexOf('};',page.indexOf('const PRODUCTS = {')));
  const products=[...block.matchAll(/^\s*([a-z0-9_]+):\s*\{\s*name:\s*'([^']+)',\s*amount:\s*(\d+)/gm)].map(m=>({id:m[1],name:m[2],amount:Number(m[3])}));
  assert.ok(products.length>=5,'expected to find the products page catalogue');
  let payload;t.mock.method(globalThis,'fetch',async(url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({id:'order_test'})};});
  for(const p of products){
    // Send exactly what the page sends, including a forged amount the server must ignore.
    const res=response();await createOrder(request({amount:1,product_id:p.id,product_name:'tampered',name:'Test',email:'test@example.com'}),res);
    assert.equal(res.statusCode,200,`${p.id} should create an order`);
    assert.equal(payload.amount,p.amount,`${p.id} server price should match the page`);
    assert.equal(payload.notes.product_id,p.id);assert.equal(payload.notes.product_name,p.name);
  }
});
test('invalid checkout and inherited property names cannot create orders',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('must not fetch');});
  for(const body of [null,[],{plan:'starter',name:{},email:'test@example.com'},{plan:'constructor',name:'Test',email:'test@example.com'},{product_id:'__proto__',name:'Test',email:'test@example.com'}]) {
    const res=response();await createOrder(request(body),res);assert.equal(res.statusCode,400);
  }
  assert.equal(calls,0);
});
test('valid coupon and full-price fallback still work',async t=>{
  const payloads=[];t.mock.method(globalThis,'fetch',async(url,opts)=>{payloads.push(JSON.parse(opts.body));return {ok:payloads.length>1,status:400,json:async()=>payloads.length>1?{id:'order_retry'}:{error:{description:'private diagnostic'}}};});
  const res=response();await createOrder(request({plan:'starter',coupon:'DIWALI',name:'Test',email:'test@example.com'}),res);
  assert.equal(payloads[0].force_offer,true);assert.equal(payloads[1].offers,undefined);assert.equal(payloads[1].amount,749900);assert.equal(res.body.couponApplied,false);
});
const signed=(orderId,paymentId)=>({razorpay_order_id:orderId,razorpay_payment_id:paymentId,
  razorpay_signature:createHmac('sha256','test-only').update(`${orderId}|${paymentId}`).digest('hex')});
test('payment signatures accept genuine data and reject tampering',async t=>{
  process.env.SUPABASE_URL='https://database.example';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
  t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>String(url).includes('razorpay')?{notes:{product_id:'consult30'}}:[]}));
  const body=signed('order_test','pay_test');
  const ok=response();await verify(request(body),ok);assert.equal(ok.body.valid,true);
  const bad=response();await verify(request({...body,razorpay_payment_id:'pay_changed'}),bad);assert.equal(bad.statusCode,400);
  for(const signature of ['x',{},'g'.repeat(64)]) {const res=response();await verify(request({...body,razorpay_signature:signature}),res);assert.equal(res.statusCode,400);}
});
test('download links come from the paid order, never from the browser',async t=>{
  process.env.SUPABASE_URL='https://database.example';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
  const calls=[];t.mock.method(globalThis,'fetch',async(url,opts)=>{
    calls.push({url:String(url),body:opts?.body&&JSON.parse(opts.body)});
    if(String(url)==='https://api.razorpay.com/v1/orders/order_paid') return {ok:true,json:async()=>({notes:{product_id:'pdf'}})};
    return {ok:true,json:async()=>[{asset_key:'pdf_folder',label:'100 Business Ideas Folder',url:'https://drive.example/pdf'},{asset_key:'x',label:'bad',url:'javascript:alert(1)'}]};
  });
  // The browser claiming a pricier product changes nothing: the order says pdf.
  const res=response();await verify(request({...signed('order_paid','pay_paid'),product_id:'combo'}),res);
  assert.equal(res.body.valid,true);assert.equal(res.body.deliveryError,false);
  assert.deepEqual(res.body.links,[{label:'100 Business Ideas Folder',url:'https://drive.example/pdf'}]);
  assert.equal(calls[1].url,'https://database.example/rest/v1/rpc/downloads_for_product');
  assert.deepEqual(calls[1].body,{p_product_id:'pdf'});
});
test('a forged payment never reaches the order or the links',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('must not fetch');});
  const res=response();await verify(request({...signed('order_paid','pay_paid'),razorpay_order_id:'order_other'}),res);
  assert.equal(res.statusCode,400);assert.equal(res.body.links,undefined);assert.equal(calls,0);
});
test('a genuine payment still verifies when the link lookup fails',async t=>{
  process.env.SUPABASE_URL='https://database.example';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
  t.mock.method(globalThis,'fetch',async()=>{throw Error('network down');});
  const res=response();await verify(request(signed('order_paid','pay_paid')),res);
  assert.equal(res.body.valid,true);assert.deepEqual(res.body.links,[]);assert.equal(res.body.deliveryError,true);
});
test('no page or function ships a paid Drive folder link',()=>{
  const root=new URL('../',import.meta.url);
  const offenders=readdirSync(root,{recursive:true})
    .filter(f=>/\.(html|js)$/.test(f)&&!/(^|\/)(node_modules|graphify-out|tests)\//.test(f)&&!/backup/.test(f))
    .filter(f=>/drive\.google\.com\/drive\/folders\//.test(readFileSync(new URL(f,root),'utf8')));
  assert.deepEqual(offenders,[]);
});
async function sendWebhook(raw, signature) {
  const req=Readable.from([Buffer.from(raw)]);req.method='POST';req.headers={'x-razorpay-signature':signature};
  const res=response();await webhook(req,res);return res;
}
test('webhooks require a matching raw-body signature',async()=>{
  const raw=JSON.stringify({event:'other'});const sig=createHmac('sha256','test-only-webhook').update(raw).digest('hex');
  assert.equal((await sendWebhook(raw,sig)).statusCode,200);
  assert.equal((await sendWebhook(raw+' ',sig)).statusCode,400);
  assert.equal((await sendWebhook(raw,'bad')).statusCode,400);
});
test('signed malformed captured events fail safely',async()=>{
  const raw=JSON.stringify({event:'payment.captured'});const sig=createHmac('sha256','test-only-webhook').update(raw).digest('hex');
  assert.equal((await sendWebhook(raw,sig)).statusCode,400);
});
test('oversized webhook body is rejected',async()=>{
  assert.equal((await sendWebhook('x'.repeat(1024*1024+1),'bad')).statusCode,413);
});
test('a genuine captured membership reaches both purchase stores',async t=>{
  process.env.SUPABASE_URL='https://database.example';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
  process.env.FW_SUPABASE_URL='https://membership.example';process.env.FW_SUPABASE_SERVICE_ROLE_KEY='test-only';
  const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push({url,body:options.body && JSON.parse(options.body)});
    return {ok:true,json:async()=>({notes:{product_id:'fw-membership-annual',product_name:'Annual',email:'test@example.com',name:'Test'}})};
  });
  const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{order_id:'order_test',id:'pay_test',amount:999900,currency:'INR'}}}});
  const signature=createHmac('sha256','test-only-webhook').update(raw).digest('hex');
  const res=await sendWebhook(raw,signature);
  assert.equal(res.body.success,true);assert.equal(calls.length,3);
  assert.equal(calls[1].body.p_user_id,null);assert.equal(calls[1].body.p_razorpay_payment_id,'pay_test');
  assert.equal(calls[2].body.plan,'annual');assert.equal(calls[2].body.razorpay_payment_id,'pay_test');
});
test('a failed purchase write is retried, not dropped',async t=>{
  process.env.SUPABASE_URL='https://database.example';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
  const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{order_id:'order_test',id:'pay_test',amount:49900,currency:'INR'}}}});
  const sig=createHmac('sha256','test-only-webhook').update(raw).digest('hex');
  const notes={ok:true,json:async()=>({notes:{product_id:'pdf',product_name:'PDF',email:'test@example.com',name:'Test'}})};
  t.mock.method(globalThis,'fetch',async url=>String(url).startsWith('https://api.razorpay.com')?notes:{ok:false,status:500,json:async()=>({})});
  assert.equal((await sendWebhook(raw,sig)).statusCode,503);
  t.mock.restoreAll();
  t.mock.method(globalThis,'fetch',async()=>({ok:false,status:500,json:async()=>({})}));
  assert.equal((await sendWebhook(raw,sig)).statusCode,503);
});
