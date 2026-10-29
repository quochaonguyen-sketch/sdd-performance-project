do $$
declare j uuid:=gen_random_uuid(); bad uuid:=gen_random_uuid(); n integer; stamp timestamptz:=now();
  rows jsonb:='[{"driver_id":"integration-delivery-a","total_assigned":10,"delivered":4,"delivering":5,"failed":1,"idle_delivery_seconds":0},{"driver_id":"integration-delivery-b","total_assigned":20,"delivered":10,"delivering":10,"failed":0,"idle_delivery_seconds":0}]';
begin
  if has_function_privilege('authenticated','public.publish_central_delivery_realtime(uuid,text,jsonb,timestamptz)','EXECUTE')
    or has_function_privilege('anon','public.publish_central_delivery_realtime(uuid,text,jsonb,timestamptz)','EXECUTE') then raise exception 'Public publisher access'; end if;
  insert into public.data_source_jobs(id,source_id,report_date,status,phase,worker_id,lease_until)
    values(j,'delivery_realtime',(stamp at time zone 'Asia/Ho_Chi_Minh')::date,'RUNNING','publishing','integration',stamp+interval '2 minutes');
  n:=public.publish_central_delivery_realtime(j,'integration',rows,stamp);
  if n<>2 or (select count(*) from public.realtime_delivery_riders where work_date=(stamp at time zone 'Asia/Ho_Chi_Minh')::date)<>2 then raise exception 'Snapshot replacement failed'; end if;
  update public.data_source_jobs set status='SUCCEEDED' where id=j;
  insert into public.data_source_jobs(id,source_id,report_date,status,phase,worker_id,lease_until)
    values(bad,'delivery_realtime',(stamp at time zone 'Asia/Ho_Chi_Minh')::date,'RUNNING','publishing','integration',stamp+interval '2 minutes');
  begin
    perform public.publish_central_delivery_realtime(bad,'integration',jsonb_build_array(rows->0,rows->0),stamp);
    raise exception 'Duplicate accepted';
  exception when others then
    if sqlerrm<>'Invalid delivery rider' then raise; end if;
  end;
  begin
    perform public.publish_central_delivery_realtime(bad,'intruder',rows,stamp);
    raise exception 'Wrong worker accepted';
  exception when others then
    if sqlerrm<>'Invalid delivery realtime ownership' then raise; end if;
  end;
  if (select count(*) from public.realtime_delivery_riders where snapshot_id=j)<>2 then raise exception 'Bad publication changed existing snapshot'; end if;
  -- Another writer may publish while the central worker is reading SPX.
  n:=public.publish_central_delivery_realtime(bad,'integration',rows,stamp-interval '1 second');
  if n<>0 or (select count(*) from public.realtime_delivery_riders where snapshot_id=j)<>2 then raise exception 'Older snapshot changed newer data'; end if;
  if not exists(select 1 from public.data_source_jobs where id=bad and events @> '[{"message":"Đã có snapshot mới hơn; giữ nguyên dữ liệu hiện tại"}]'::jsonb) then raise exception 'Skipped snapshot has no explanation'; end if;
  if not public.finish_data_source_job(bad,'integration','SUCCEEDED') then raise exception 'Skip acknowledgement failed'; end if;
  if not exists(select 1 from public.data_source_jobs where id=bad and status='SUCCEEDED' and message='Đã có snapshot mới hơn; giữ nguyên dữ liệu hiện tại') then raise exception 'Skip reason was lost'; end if;
  update public.data_source_jobs set status='RUNNING',phase='publishing',lease_until=stamp+interval '2 minutes' where id=bad;
  n:=public.publish_central_delivery_realtime(bad,'integration',rows,stamp+interval '1 second');
  if n<>2 or (select count(*) from public.realtime_delivery_riders where snapshot_id=bad)<>2 then raise exception 'Newer snapshot was not published'; end if;
end $$;
