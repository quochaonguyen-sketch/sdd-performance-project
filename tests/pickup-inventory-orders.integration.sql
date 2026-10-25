-- Run with admin-audit-db.cjs --test; all fixtures roll back.
do $test$
declare k text := 'order-test-'||gen_random_uuid();
  one text := '9998'||floor(random()*1000000000000)::bigint::text||'1';
  two text := '9998'||floor(random()*1000000000000)::bigint::text||'2';
  result jsonb;
begin
  insert into public.riders(rider_code,name,full_name,cot,kv,status) values
    (one,'Test order rider 1','Test order rider 1','COT 1','KV2','active'),
    (two,'Test order rider 2','Test order rider 2','COT 2','KV2','active');
  insert into public.pickup_48h_no_api2(tracking_id,shipment_id,sls_tracking_number,area,ward,status,zone_name,cot_group,assigned_riders_today) values
    (k||'a',k||'a','TEST_001%','KV2','Ward A',k,'ZONE-A','24/10/2026 COT 1','[COT2] '||one||'-Old name; [COT1] '||two||'-Old name'),
    (k||'b',k||'b','TESTX001A','KV2','Ward B',k,'ZONE-B','24/10/2026 COT 2','[COT1] '||one||'-Name; [COT2] '||two||'-Name'),
    (k||'c',k||'a','TEST_001%','KV2','Ward A',k,'ZONE-A','24/10/2026 COT 1','[COT1] '||one||'-Name; [COT2] '||two||'-Name'),
    (k||'d',k||'d','OUTSIDE','KV1','Ward A',k,'ZONE-A','COT1','[COT1] '||one||'-Name'),
    (k||'e',k||'e','MISSING','KV2','Ward A',k,'','COT2','');
  result:=public.pickup_inventory_orders('KV2',k,'',one,'COT1','all','',0);
  if (result->>'total')::int<>2 then raise exception 'Rider backlog/identity/deduplication mismatch'; end if;
  if (public.pickup_inventory_orders('KV2',k,'',one,'COT2','all','',0)->>'total')::int<>0 then raise exception 'Roster COT mismatch leaked'; end if;
  if (public.pickup_inventory_orders('KV2',k,'ZONE-A','','','cot2','',0)->>'total')::int<>0 then raise exception 'Zone order COT mismatch'; end if;
  if (public.pickup_inventory_orders('KV2',k,'ZONE-A','','','cot1','',0)->>'total')::int<>1 then raise exception 'Zone count or area scope mismatch'; end if;
  if (public.pickup_inventory_orders('KV2',k,'Chưa có mã zone','','','all','',0)->>'total')::int<>1 then raise exception 'Missing zone bucket excluded'; end if;
  if (public.pickup_inventory_orders('KV2',k,'','','','all','TEST_001%',0)->>'total')::int<>1 then raise exception 'Search treats wildcards as patterns'; end if;
  if jsonb_array_length(public.pickup_inventory_orders('KV2',k,'','','','all','',100)->'rows')<>0 then raise exception 'Pagination not applied'; end if;
  if exists(select 1 from jsonb_array_elements(result->'rows') row where row ? 'full_address' or row ? 'assigned_riders_today') then raise exception 'Unnecessary order fields exposed'; end if;
  if has_function_privilege('anon','public.pickup_inventory_orders(text,text,text,text,text,text,text,integer)','EXECUTE') or has_function_privilege('authenticated','public.pickup_inventory_orders(text,text,text,text,text,text,text,integer)','EXECUTE') then raise exception 'RPC bypasses API permissions'; end if;
end $test$;
