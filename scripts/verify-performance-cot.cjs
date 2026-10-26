let db;
(async()=>{
 const fs=await import('node:fs');const {isDeepStrictEqual}=await import('node:util');
 const {PrismaClient}=await import('@prisma/client');db=new PrismaClient();
 const [day,path]=process.argv.slice(2);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day??'')||!path)throw Error('Usage: verify-performance-cot.cjs YYYY-MM-DD artifact.json');
 const expected=JSON.parse(fs.readFileSync(path,'utf8')).records;
 const actual=await db.$queryRawUnsafe('select driver_id,cot,delivery_assigned,delivery_delivered,pickup_assigned,pickup_picked,delivery_assigned_cot1,delivery_delivered_cot1,delivery_assigned_cot2,delivery_delivered_cot2,pickup_assigned_cot1,pickup_picked_cot1,pickup_assigned_cot2,pickup_picked_cot2,cot_breakdown from public.driver_performance_daily where report_date=$1::date',day);
 const lookup=new Map(actual.map(r=>[r.driver_id,r]));let mismatches=0;
 for(const row of expected){const saved=lookup.get(row.driver_id);if(!saved){mismatches++;continue;}
  if(Object.keys(saved).some(key=>!isDeepStrictEqual(saved[key],row[key])))mismatches++;
 }
 const result={day,expected:expected.length,actual:actual.length,mismatches,with_breakdown:actual.filter(r=>r.cot_breakdown!==null).length};
 console.log(JSON.stringify(result));
 if(mismatches||actual.length!==expected.length)throw Error('Performance COT verification failed');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
