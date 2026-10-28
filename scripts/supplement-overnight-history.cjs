// One-time, explicitly requested supplement. Source rows stay in RAM; no raw artifact.
const {spawn}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
const localDay=d=>new Date(new Date(d).getTime()+7*3600000).toISOString().slice(0,10);
const insertSql="insert into public.overnight_hold_orders(cutoff_date,order_key,order_code,area,district,ward,rider_code,rider_name,cutoff_status,current_status,reason,reason_label,delivering_at,is_cutoff_member,added_after_cutoff_at,last_synced_at) select $1::date,r.order_key,r.order_code,r.area,r.district,r.ward,r.rider_code,r.rider_name,r.status,case when r.status=1 then 'Delivering' else 'Onhold' end,r.reason,r.reason_label,r.delivering_at,true,$3::timestamptz,$3::timestamptz from jsonb_to_recordset($2::jsonb) r(order_key text,order_code text,area text,district text,ward text,rider_code text,rider_name text,status smallint,reason text,reason_label text,delivering_at timestamptz) on conflict(cutoff_date,order_code) do nothing returning id::text";
function readSource(day){
 const worker=path.resolve('..','sdd-web-data');
 const py="import json; from datetime import datetime,date; from sdd_data.config import Settings; from sdd_data.transform import TZ; from sdd_data.onhold_daily import prepare_onhold_observations; s=Settings.load(); d=datetime.now(TZ).date(); rows,stats=prepare_onhold_observations(s,d,overnight=True,through_day=date.fromisoformat("+JSON.stringify(day)+")); print(json.dumps({'today':str(d),'station':s.station_id,'rows':rows,**stats}))";
 return new Promise((resolve,reject)=>{
  const child=spawn(path.join(worker,'.venv','Scripts','python.exe'),['-X','utf8','-c',py],{cwd:worker,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let out='',size=0;child.stdout.on('data',b=>{size+=b.length;if(size>10*1024*1024){child.kill();reject(Error('SPX payload too large'));}else out+=b.toString('utf8')});
  child.stderr.resume();child.on('error',()=>reject(Error('Cannot start the SPX reader')));
  const timer=setTimeout(()=>{child.kill();reject(Error('SPX scan exceeded 15 minutes; nothing imported'))},900000);
  child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('SPX scan failed; nothing imported. Check local SPX session.'));try{resolve(JSON.parse(out))}catch{reject(Error('Invalid SPX reader result'))}});
 });
}
(async()=>{
 const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0],url=new URL(process.env.DATABASE_URL);
 assert.ok(url.hostname.includes(ref)||decodeURIComponent(url.username).includes(ref),'Database project mismatch');
 const [snapshot]=await db.$queryRawUnsafe("select cutoff_date::text,status from public.overnight_hold_snapshots where status='locked' order by cutoff_date desc limit 1");
 assert.ok(snapshot,'No existing locked overnight list to supplement');
 const now=new Date(),cutoff=new Date(now.getTime()+7*3600000);if(cutoff.getUTCHours()<23)cutoff.setUTCDate(cutoff.getUTCDate()-1);
 const day=cutoff.toISOString().slice(0,10);assert.equal(snapshot.cutoff_date,day,'Latest locked day must match the current Overnight page');
 console.log('Reading current SPX statuses for prior-day orders; target Overnight:',day);
 const source=await readSource(day);
 assert.equal(String(source.station),'4232');assert.equal(source.today,localDay(new Date()));
 const observed=source.scan_started_at;assert.ok(Date.now()-Date.parse(observed)>=0&&Date.now()-Date.parse(observed)<15*60000,'Scan must be fresh');
 const rows=source.rows.filter(r=>localDay(r.delivering_at)<=day);
 assert.equal(new Set(rows.map(r=>r.order_code)).size,rows.length,'Duplicate source order');
 for(const r of rows){
  assert.ok([1,5].includes(r.status)&&r.rider_code&&!['0','unknown'].includes(r.rider_code));
  assert.ok(/^[a-f0-9]{64}$/.test(r.order_key)&&r.order_code&&r.order_code.length<=100);
  assert.ok(['Khu vực 1','Khu vực 2','Khu vực 3','Khu vực 4','Khu vực 5','Chưa rõ KV'].includes(r.area));
  assert.ok(Date.parse(r.delivering_at)<=Date.parse(observed));
 }
 const rollback=Error('rollback');let result;
 try{await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("set local lock_timeout='10s'");
  await tx.$executeRawUnsafe('select pg_advisory_xact_lock(948251,18)');
  const [locked]=await tx.$queryRawUnsafe("select captured_at,status,status_sync_token,status_sync_started_at from public.overnight_hold_snapshots where cutoff_date=$1::date for update",day);
  assert.equal(locked.status,'locked');
  assert.ok(!locked.status_sync_token||Date.now()-new Date(locked.status_sync_started_at).getTime()>10*60000,'An SPX sync is running; retry after it finishes');
  await tx.$executeRawUnsafe('alter table public.overnight_hold_orders add column if not exists added_after_cutoff_at timestamptz');
  await tx.$executeRawUnsafe('alter table public.overnight_hold_snapshots add column if not exists supplemented_at timestamptz, add column if not exists supplemented_count integer not null default 0');
  const before=await tx.$queryRawUnsafe('select * from public.overnight_hold_orders where cutoff_date=$1::date order by id',day);
  const payload=JSON.stringify(rows),inserted=await tx.$queryRawUnsafe(insertSql,day,payload,observed);
  assert.equal((await tx.$queryRawUnsafe(insertSql,day,payload,observed)).length,0,'Retry inserted duplicate orders');
  const after=await tx.$queryRawUnsafe('select * from public.overnight_hold_orders where cutoff_date=$1::date order by id',day);
  const originals=new Set(before.map(r=>r.id));assert.deepEqual(after.filter(r=>originals.has(r.id)),before,'Existing orders or notes changed');
  assert.equal(after.length,before.length+inserted.length);
  await tx.$executeRawUnsafe("update public.overnight_hold_snapshots s set total_orders=a.total,delivering_count=a.delivering,onhold_count=a.onhold,rider_count=a.riders,resolved_count=a.resolved,supplemented_count=a.supplemented,supplemented_at=case when $2::integer>0 then $3::timestamptz else supplemented_at end,updated_at=case when $2::integer>0 then now() else updated_at end from (select count(*)::int total,count(*) filter(where cutoff_status=1)::int delivering,count(*) filter(where cutoff_status=5)::int onhold,count(distinct rider_code)::int riders,count(*) filter(where current_status in ('Delivered','Returned'))::int resolved,count(*) filter(where added_after_cutoff_at is not null)::int supplemented from public.overnight_hold_orders where cutoff_date=$1::date and is_cutoff_member) a where s.cutoff_date=$1::date",day,inserted.length,observed);
  const [updated]=await tx.$queryRawUnsafe('select captured_at,total_orders,supplemented_count from public.overnight_hold_snapshots where cutoff_date=$1::date',day);
  assert.equal(+updated.captured_at,+locked.captured_at,'Original cutoff time changed');
  result={day,eligibleOldOrders:rows.length,added:inserted.length,existingSkipped:rows.length-inserted.length,total:updated.total_orders,supplemented:updated.supplemented_count};
  if(process.argv.includes('--test'))throw rollback;
 },{timeout:60000})}catch(e){if(e!==rollback)throw e}
 console.log(process.argv.includes('--test')?'Supplement verified; transaction rolled back:':'Supplement committed:',result);
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());

