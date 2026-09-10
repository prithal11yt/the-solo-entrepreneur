import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.equal(res.statusCode,200);assert.equal(payload.amount,999900);assert.equal(payload.notes.user_id,'');
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
  const res=response();await createOrder(request({plan:'starter',coupon:'FESTIVAL',name:'Test',email:'test@example.com'}),res);
  assert.equal(payloads[0].force_offer,true);assert.equal(payloads[1].offers,undefined);assert.equal(payloads[1].amount,599900);assert.equal(res.body.couponApplied,false);
});
test('payment signatures accept genuine data and reject tampering',async()=>{
  const body={razorpay_order_id:'order_test',razorpay_payment_id:'pay_test'};
  body.razorpay_signature=createHmac('sha256','test-only').update('order_test|pay_test').digest('hex');
  const ok=response();verify(request(body),ok);assert.equal(ok.body.valid,true);
  const bad=response();verify(request({...body,razorpay_payment_id:'pay_changed'}),bad);assert.equal(bad.statusCode,400);
  for(const signature of ['x',{},'g'.repeat(64)]) {const res=response();verify(request({...body,razorpay_signature:signature}),res);assert.equal(res.statusCode,400);}
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
