import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBillingDate, dueSubscriptions, subscriptionCalendar } from '../src/lib/lifestyle';
import type { Subscription } from '../src/lib/types';
import { createAccountBackend } from '../server/account-backend';
import { marketSymbol, parseQuote, stockQuote } from '../worker/stocks';
const sub:Subscription={id:'c3287517-7b6f-4dd7-9cd3-68cb71c383f8',name:'AI,工具;测试',amount:20,currency:'USD',nextRenewal:'2026-01-31',billingDay:31,intervalMonths:1,reminderDays:3,active:true,category:'ai',url:'',note:'每月提醒\n第二行'};
test('monthly renewal retains original billing day through February, leap years and quarterly/yearly boundaries',()=>{
 assert.equal(nextBillingDate('2026-01-31',31,1),'2026-02-28');assert.equal(nextBillingDate('2026-02-28',31,1),'2026-03-31');assert.equal(nextBillingDate('2028-01-31',31,1),'2028-02-29');assert.equal(nextBillingDate('2028-02-29',29,12),'2029-02-28');assert.equal(nextBillingDate('2026-11-30',30,3),'2027-02-28');
 assert.deepEqual(dueSubscriptions([sub,{...sub,id:'paused',active:false},{...sub,id:'later',nextRenewal:'2026-02-01'}],'2026-01-28').map(s=>s.id),[sub.id]);assert.equal(dueSubscriptions([sub],'2026-02-05').length,1);
});
test('calendar exports stable recurring IDs, short-month fallback, escaped content and UTF8 folded reminders',()=>{
 const ics=subscriptionCalendar([{...sub,note:'中文字'.repeat(90)}, {...sub,id:'disabled',active:false}]);
 assert.match(ics,/DTSTART;VALUE=DATE:20260131/);assert.match(ics,/RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28,29,30,31;BYSETPOS=-1/);assert.match(ics,/TRIGGER:-P3D/);assert.match(ics,/SUMMARY:AI\\,工具\\;测试 续费/);assert.doesNotMatch(ics,/disabled/);for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,1);
});
function browser(backend:ReturnType<typeof createAccountBackend>){let cookie='';return async(path:string,method='GET',value?:unknown)=>{const response=await backend.fetch(new Request(`https://new-era.test/api${path}`,{method,headers:{Origin:'https://new-era.test','X-Requested-With':'ExchangeLife','Content-Type':'application/json',Cookie:cookie},body:value===undefined?undefined:JSON.stringify(value)}));if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0];return response;};}
test('new modules persist privately; renewals reject repeated confirmation; workouts are one per day and reject future dates',async t=>{
 const backend=createAccountBackend(':memory:');t.after(backend.close);const a=browser(backend),b=browser(backend);
 for(const [client,email] of [[a,'a@new.test'],[b,'b@new.test']] as const)assert.equal((await client('/auth/register','POST',{email,name:email,password:'New-era-test-password-2026!'})).status,201);
 const saved=await a('/subscriptions','POST',sub);assert.equal(saved.status,201);const item=await saved.json();assert.equal((await b(`/subscriptions/${item.id}/renew`,'POST',{nextRenewal:item.nextRenewal})).status,404);
 const renewed=await a(`/subscriptions/${item.id}/renew`,'POST',{nextRenewal:item.nextRenewal});assert.equal(renewed.status,200);assert.equal((await renewed.json()).nextRenewal,'2026-02-28');assert.equal((await a(`/subscriptions/${item.id}/renew`,'POST',{nextRenewal:item.nextRenewal})).status,409);
 const next=await a(`/subscriptions/${item.id}/renew`,'POST',{nextRenewal:'2026-02-28'});assert.equal((await next.json()).nextRenewal,'2026-03-31');
 const workout={date:'2026-01-01',minutes:20,note:'完成'};const first=await (await a('/workouts','POST',workout)).json(),second=await (await a('/workouts','POST',workout)).json();assert.equal(first.id,second.id);assert.equal((await (await a('/data')).json()).workouts.length,1);assert.equal((await a('/workouts','POST',{...workout,date:'2099-01-01'})).status,400);assert.equal((await a(`/workouts/${first.id}`,'PUT',{...workout,date:'2026-01-02'})).status,409);assert.equal((await b(`/workouts/${first.id}`,'DELETE')).status,404);
 for(const [collection,value] of [['watchlist',{market:'TW',symbol:'2330',name:'台积电'}]] as const){assert.equal((await a(`/${collection}`,'POST',value)).status,201);assert.deepEqual((await (await b('/data')).json())[collection],[]);assert.equal((await (await a('/export')).json())[collection].length,1);}
 assert.equal((await a('/stocks/quote?market=TW&symbol=../../secret')).status,400);assert.equal((await b('/data')).status,200);
});
const now=Date.parse('2026-01-08T10:00:00Z');const payload={chart:{result:[{meta:{regularMarketPrice:120,regularMarketTime:now/1000,currency:'TWD',exchangeTimezoneName:'Asia/Taipei',shortName:'Test'},timestamp:[Date.parse('2026-01-06T05:00:00Z')/1000,Date.parse('2026-01-07T05:00:00Z')/1000,now/1000],indicators:{quote:[{close:[100,110,120]}]}}]}};
test('quotes normalize four markets and calculate daily change against previous trading close',()=>{
 assert.equal(marketSymbol('TW','2330'),'2330.TW');assert.equal(marketSymbol('TW','6488.TWO'),'6488.TWO');assert.equal(marketSymbol('HK','700'),'0700.HK');assert.equal(marketSymbol('CN','600519'),'600519.SS');assert.equal(marketSymbol('CN','000001'),'000001.SZ');assert.equal(marketSymbol('US','BRK.B'),'BRK-B');const q=parseQuote(payload,'2330.TW',now);assert.equal(q.previousClose,110);assert.equal(q.change,10);assert.equal(q.history.length,3);assert.throws(()=>parseQuote({chart:{result:[]}},'bad',now));assert.throws(()=>parseQuote({...payload,chart:{result:[{...payload.chart.result[0],meta:{...payload.chart.result[0].meta,regularMarketPrice:NaN}}]}},'bad',now));
});
test('quotes cache provider results, mark stale on outage and fail truthfully without any cached price',async t=>{
 const backend=createAccountBackend(':memory:');t.after(backend.close);let calls=0;const feed=(async()=>{calls++;return Response.json(payload);}) as typeof fetch;
 const first=await stockQuote(backend.env.DB,'TW','2330',feed,now);assert.equal(first.stale,false);await stockQuote(backend.env.DB,'TW','2330',feed,now+1);assert.equal(calls,1);const failed=(async()=>{throw new Error('outage');}) as typeof fetch;const stale=await stockQuote(backend.env.DB,'TW','2330',failed,now+300001);assert.equal(stale.price,120);assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,first.fetchedAt);await assert.rejects(()=>stockQuote(backend.env.DB,'US','AAPL',failed,now));
});
