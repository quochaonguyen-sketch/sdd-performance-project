-- Compact Delivery transport preserves the same atomic ownership-checked publication.
do $$
declare job uuid; token text:='compact-test-'||gen_random_uuid()::text; result integer;
begin
 if has_function_privilege('authenticated','public.publish_sdd_delivery_compact(uuid,text,text,timestamptz,jsonb,jsonb,text[],boolean)','execute') then raise exception 'Compact writer exposed'; end if;
 insert into public.lmhub_fetch_jobs(status,worker_id,updated_at,started_at,params) values('RUNNING','compact-owner',now(),now(),'{"kind":"delivery"}') returning id into job;
 result:=public.publish_sdd_delivery_compact(job,'compact-owner',token,now(),jsonb_build_array(
  jsonb_build_array(token||'-a',now(),now(),0),jsonb_build_array(token||'-b',now(),now(),0)),
  '[["2026-10-26","Phường A","Quận 4","KV1","route-a","MP","2026-10-26 COT 1"]]',array['KV1'],false);
 if result<>2 or (select count(*) from public.lmhub_inventory_rows where snapshot_id=token and ward='Phường A' and district='Quận 4' and zone_id='route-a' and status='LMHub_Received' and cot_group='2026-10-26 COT 1')<>2 then raise exception 'Compact data mismatch'; end if;
 if not exists(select 1 from public.backlog_snapshots where source_snapshot_id=token and total_orders=2) then raise exception 'Compact history missing'; end if;
 begin
  perform public.publish_sdd_delivery_compact(job,'compact-owner',token,now(),'[["bad",null,null,9]]','[]',array['KV1'],false);
  raise exception 'Invalid group accepted';
 exception when others then if sqlerrm='Invalid group accepted' then raise; end if; end;
 if (select count(*) from public.lmhub_inventory_rows where snapshot_id=token)<>2 then raise exception 'Invalid compact input changed rows'; end if;
end $$;

