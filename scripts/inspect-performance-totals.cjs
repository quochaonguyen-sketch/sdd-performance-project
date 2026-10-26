let db;
(async()=>{
 const {PrismaClient}=await import('@prisma/client');db=new PrismaClient();
 const rows=await db.$queryRawUnsafe(`select report_date::text,driver_id,delivery_delivered,pickup_assigned,pickup_picked,pickup_assigned_cot1,pickup_picked_cot1,pickup_assigned_cot2,pickup_picked_cot2,cot_breakdown->'quality' as quality from public.driver_performance_daily where driver_id='158197' order by report_date desc limit 15`);
 console.log(JSON.stringify(rows));
 const mismatches=await db.$queryRawUnsafe(`select report_date::text,count(*)::int as inconsistent from public.driver_performance_daily where pickup_picked_cot1+pickup_picked_cot2>pickup_picked or pickup_assigned_cot1+pickup_assigned_cot2>pickup_assigned group by report_date order by report_date desc limit 15`);
 console.log(JSON.stringify(mismatches));
 const totals=await db.$queryRawUnsafe(`select report_date::text,count(*)::int as rows,sum(pickup_picked)::int as picked,sum(pickup_picked_cot1+pickup_picked_cot2)::int as split_picked from public.driver_performance_daily group by report_date order by report_date desc limit 12`);console.log(JSON.stringify(totals));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
