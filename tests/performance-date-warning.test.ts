import test from 'node:test';
import assert from 'node:assert/strict';
import { pickupCotWarning } from '../lib/performance/pickup-warning.ts';
import { setPerformanceDates, parsePerformanceFilters } from '../lib/performance/filters.ts';

test('single date and date range share one selection and preserve other filters',()=>{
 const params=new URLSearchParams({period:'month',start:'2026-10-01',end:'2026-10-28',page:'4',q:'Rider',kv:'KV2',cot:'COT 2',preset:'old',mode:'old'});
 setPerformanceDates(params,'2026-10-27');
 let result=parsePerformanceFilters(params);assert.equal(result.period,'day');assert.equal(result.start,'2026-10-27');assert.equal(result.end,result.start);assert.equal(result.page,1);assert.equal(result.kv,'KV2');assert.equal(result.q,'Rider');assert.ok(!params.has('start')&&!params.has('preset'));
 setPerformanceDates(params,'2026-10-20','2026-10-28');result=parsePerformanceFilters(params);assert.equal(result.period,'range');assert.equal(result.start,'2026-10-20');assert.equal(result.end,'2026-10-28');assert.equal(result.cot,'COT 2');
 setPerformanceDates(params,'2026-10-28','2026-10-28');assert.equal(parsePerformanceFilters(params).period,'day');
 for(const [start,end] of [['2026-02-30','2026-03-01'],['2026-10-29','2026-10-28'],['','2026-10-28']])assert.throws(()=>setPerformanceDates(params,start,end));
});
test('yellow warning only flags scheduled COT2 riders with actual COT1 pickup',()=>{
 const row={cot:'COT2',pickup_assigned:30,pickup_picked:27,pickup_assigned_cot1:12,pickup_picked_cot1:12,pickup_assigned_cot2:18,pickup_picked_cot2:15};
 for(const cot of ['COT 2','COT2','2'])assert.match(pickupCotWarning({...row,cot})??'',/12.*13:00/);
 for(const cot of ['COT 1','COT1.1','COT1.2',null,''])assert.equal(pickupCotWarning({...row,cot}),null);
 assert.equal(pickupCotWarning({...row,pickup_picked_cot1:0}),null);
 // These stale historical splits previously warned despite the displayed Pick being 0/0.
 for(const [c1,c2] of [[12,15],[27,21],[3,15]])assert.equal(pickupCotWarning({...row,pickup_assigned:0,pickup_picked:0,pickup_assigned_cot1:c1,pickup_picked_cot1:c1,pickup_assigned_cot2:c2,pickup_picked_cot2:c2}),null);
 assert.equal(pickupCotWarning({...row,pickup_picked:0}),null);
 assert.equal(pickupCotWarning({...row,pickup_picked:10}),null);
 assert.equal(pickupCotWarning({...row,pickup_assigned:20}),null);
 assert.equal(pickupCotWarning({...row,pickup_assigned_cot1:10}),null);
});
