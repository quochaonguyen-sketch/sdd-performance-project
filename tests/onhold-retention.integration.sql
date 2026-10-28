do $test$
declare today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; d date; token text:=md5(gen_random_uuid()::text); before_totals jsonb; result jsonb;
begin
 for d in select today-x from unnest(array[0,1,6,7]) x loop
  insert into public.onhold_daily_reports(report_date,job_id,input_count,excluded_count,total_orders,collection_mode)
   values(d,gen_random_uuid(),0,0,0,'cumulative') on conflict do nothing;
  insert into public.onhold_daily_seen(report_date,order_key) values(d,token||token);
  insert into public.onhold_daily_orders(report_date,order_key,order_code,area,district,ward,reason,reason_label,status,hour,rider_code,rider_name)
   values(d,token||token,'RETENTION-'||token,'Khu vực 1','Test district','Test ward','169','Test reason',5,12,'QA','QA');
 end loop;
 select jsonb_agg(jsonb_build_array(report_date,total_orders) order by report_date) into before_totals from public.onhold_daily_reports;
 perform public.finalize_onhold_days(today::timestamp at time zone 'Asia/Ho_Chi_Minh');
 if (select count(*) from public.onhold_daily_orders where order_key=token||token)<>3
  or (select count(*) from public.onhold_daily_seen where order_key=token||token)<>3
  or exists(select 1 from public.onhold_daily_orders where order_key=token||token and report_date=today-7)
  then raise exception 'Retention must keep today and previous six dates only'; end if;
 if exists(select 1 from public.onhold_daily_reports where report_date in (today-1,today-6,today-7) and collection_mode='cumulative' and finalized_at is null)
  then raise exception 'Day close was delayed by retention'; end if;
 result:=public.read_onhold_orders(today-6,p_q=>'RETENTION-'||token);
 if result->>'has_snapshot'<>'true' or (result->>'total')::int<>1 then raise exception 'Six-day-old orders cannot be viewed'; end if;
 result:=public.export_onhold_orders(today-6,p_q=>'RETENTION-'||token);
 if result->>'has_snapshot'<>'true' or jsonb_array_length(result->'orders')<>1 then raise exception 'Six-day-old orders cannot be exported'; end if;
 perform public.finalize_onhold_days(today::timestamp at time zone 'Asia/Ho_Chi_Minh');
 if (select count(*) from public.onhold_daily_orders where order_key=token||token)<>3 then raise exception 'Repeated cleanup changed retained orders'; end if;
 perform public.finalize_onhold_days((today+1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
 if exists(select 1 from public.onhold_daily_orders where order_key=token||token and report_date=today-6)
  or exists(select 1 from public.onhold_daily_seen where order_key=token||token and report_date=today-6)
  or not exists(select 1 from public.onhold_daily_orders where order_key=token||token and report_date=today)
  then raise exception 'Retention did not advance at Vietnam midnight'; end if;
 if before_totals is distinct from (select jsonb_agg(jsonb_build_array(report_date,total_orders) order by report_date) from public.onhold_daily_reports)
  then raise exception 'Retention changed historical OH totals'; end if;
 if has_table_privilege('anon','public.onhold_daily_orders','select')
  or has_table_privilege('authenticated','public.onhold_daily_orders','select')
  or has_function_privilege('authenticated','public.finalize_onhold_days(timestamptz)','execute')
  then raise exception 'OH details exposed'; end if;
end $test$;
