do $$
declare claim jsonb; result jsonb; token uuid; before_sync timestamptz;
begin
 -- Isolate fixtures from real pending days; the test runner rolls everything back.
 update public.overnight_hold_snapshots set status_sync_attempted_at=now(),status_sync_requested_at=null,status_sync_token=null;
 insert into public.overnight_hold_snapshots(cutoff_date,status) values('2099-04-01','locked');
 insert into public.overnight_hold_orders(cutoff_date,order_key,order_code,area,rider_code,note,current_status,is_cutoff_member)
 values('2099-04-01','test-a','SYNC-A','Khu vực 1','original-rider','keep note','Onhold',true),
 ('2099-04-01','test-b','SYNC-B','Khu vực 1','original-rider','keep note','Onhold',true);
 select last_synced_at into before_sync from public.overnight_hold_orders where order_code='SYNC-A';
 result:=public.sync_overnight_hold_status('2099-04-01');
 if result->>'queued'<>'true' then raise exception 'Manual sync did not queue'; end if;
 claim:=public.claim_overnight_status_sync();token:=(claim->>'token')::uuid;
 if claim->>'day'<>'2099-04-01' or jsonb_array_length(claim->'orders')<>2 then raise exception 'Bad claim'; end if;
 if public.claim_overnight_status_sync() is not null then raise exception 'Duplicate claim'; end if;
 begin
  perform public.finish_overnight_status_sync('2099-04-01',token,'[{"order_code":"SYNC-A","current_status":"Delivered"}]');
  raise exception 'TEST: missing order accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 begin
  perform public.finish_overnight_status_sync('2099-04-01',gen_random_uuid(),'[]');
  raise exception 'TEST: wrong token accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 begin
  perform public.finish_overnight_status_sync('2099-04-01',token,'[{"order_code":"SYNC-A","current_status":"Delivered"},{"order_code":"SYNC-A","current_status":"Onhold"}]');
  raise exception 'TEST: duplicate order accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 result:=public.finish_overnight_status_sync('2099-04-01',token,
 '[{"order_code":"SYNC-A","current_status":"Delivered"},{"order_code":"SYNC-B","current_status":"Delivering"}]');
 if result->>'resolved_count'<>'1' or result->>'synced_count'<>'2' then raise exception 'Wrong totals'; end if;
 if not exists(select 1 from public.overnight_hold_orders where order_code='SYNC-A' and current_status='Delivered'
 and rider_code='original-rider' and note='keep note' and cutoff_status=1) then raise exception 'Cutoff or notes changed'; end if;
 if public.claim_overnight_status_sync() is not null then raise exception 'Five minute delay ignored'; end if;
 perform public.sync_overnight_hold_status('2099-04-01');
 claim:=public.claim_overnight_status_sync();token:=(claim->>'token')::uuid;
 result:=public.finish_overnight_status_sync('2099-04-01',token,'[]','SPX unavailable');
 if not exists(select 1 from public.overnight_hold_snapshots where cutoff_date='2099-04-01' and status_sync_error='SPX unavailable' and status_synced_at is not null)
 or not exists(select 1 from public.overnight_hold_orders where order_code='SYNC-A' and current_status='Delivered')
 then raise exception 'Failed lookup overwrote previous result'; end if;
 update public.overnight_hold_snapshots set status_sync_token=token,status_sync_started_at=now()-interval '11 minutes',status_sync_attempted_at=now()-interval '11 minutes' where cutoff_date='2099-04-01';
 claim:=public.claim_overnight_status_sync();
 if claim is null or (claim->>'token')::uuid=token then raise exception 'Expired claim not recovered'; end if;
 if has_function_privilege('anon','public.claim_overnight_status_sync()','execute')
 or has_function_privilege('authenticated','public.finish_overnight_status_sync(date,uuid,jsonb,text)','execute')
 then raise exception 'Public access to worker RPC'; end if;
end $$;
