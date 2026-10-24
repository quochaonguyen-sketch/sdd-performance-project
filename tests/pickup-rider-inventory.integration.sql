-- All fixtures and mutations are rolled back by admin-audit-db.cjs --test.
do $test$
declare result jsonb; zones jsonb; one text:='9999'||floor(random()*1000000000000)::bigint::text||'1';
  two text:='9999'||floor(random()*1000000000000)::bigint::text||'2'; key text:='cot-test-'||gen_random_uuid();
begin
  insert into public.riders(rider_code,name,full_name,cot,kv,status) values
    (one,'Test COT1','Test COT1','COT 1','KV2','active'),(two,'Test COT2','Test COT2','COT 2','KV2','active');
  insert into public.pickup_48h_no_api2(tracking_id,shipment_id,area,ward,status,zone_name,cot_group,assigned_riders_today) values
    (key||'-a',key||'-a','KV2','Test ward',key,'ZONE-A','24/10/2026 COT 1','[COT2] '||one||'-Old name; [COT1] '||two||'-Old name'),
    (key||'-b',key||'-b','KV2','Test ward',key,'ZONE-B','24/10/2026 COT 2','[COT1] '||one||'-Test COT1; [COT2] '||two||'-Test COT2');
  result:=public.pickup_inventory_riders(key);
  if jsonb_array_length(result->'rows')<>2 then raise exception 'Identity was split by old names/tags'; end if;
  if not exists(select 1 from jsonb_array_elements(result->'rows') x where x->>'rider_code'=one and x->>'rider_cot'='COT1' and (x->>'total')::int=2 and (x->>'cot2')::int=0) then raise exception 'COT1 rider leaked into COT2'; end if;
  if not exists(select 1 from jsonb_array_elements(result->'rows') x where x->>'rider_code'=two and x->>'rider_cot'='COT2' and (x->>'total')::int=2 and (x->>'cot1')::int=0) then raise exception 'COT2 rider lost old-COT backlog'; end if;
  if exists(select 1 from jsonb_array_elements(result->'rows') x where x->'zones' <> '["ZONE-A","ZONE-B"]'::jsonb) then raise exception 'Rider zone assignment incomplete'; end if;
  zones:=public.pickup_inventory_ward_zones('KV2','Test ward',key);
  if jsonb_array_length(zones)<>2 then raise exception 'Ward zone drilldown incomplete'; end if;
  if not exists(select 1 from jsonb_array_elements(zones) z where z->>'zone'='ZONE-A' and (z->>'cot1')::int=1 and (z->>'cot2')::int=0) then raise exception 'Zone COT1 changed'; end if;
  if not exists(select 1 from jsonb_array_elements(zones) z where z->>'zone'='ZONE-B' and (z->>'cot2')::int=1) then raise exception 'Zone COT2 with date prefix lost'; end if;
  if jsonb_array_length(public.pickup_inventory_ward_zones('KV1','Test ward',key))<>0 then raise exception 'Zone scope leaked across areas'; end if;
  if exists(select 1 from jsonb_array_elements(result->'rows') x where x ? 'shipment_id' or x ? 'shared') then raise exception 'Order-level payload exposed'; end if;
  insert into public.pickup_48h_no_api2(tracking_id,shipment_id,area,ward,status,zone_name,cot_group) values
    (key||'-c',key||'-c','KV2','Other ward',key,'ZONE-A','24/10/2026 COT 1'),
    (key||'-d',key||'-d','KV1','Other ward',key,'ZONE-A','24/10/2026 COT 1'),
    (key||'-e',key||'-e','KV2','Other ward',key,'','24/10/2026 COT 2');
  zones:=public.pickup_inventory_zone_board(key)->'rows';
  if not exists(select 1 from jsonb_array_elements(zones) z where z->>'area'='KV2' and z->>'zone'='ZONE-A' and z->>'cot'='COT1' and (z->>'orders')::int=2) then raise exception 'Same zone was split by ward'; end if;
  if not exists(select 1 from jsonb_array_elements(zones) z where z->>'area'='KV1' and (z->>'orders')::int=1) then raise exception 'Area totals merged'; end if;
  if not exists(select 1 from jsonb_array_elements(zones) z where z->>'zone'='Chưa có mã zone' and z->>'cot'='COT2') then raise exception 'Missing zone orders were dropped'; end if;
  if (select sum((z->>'orders')::int) from jsonb_array_elements(zones) z)<>5 then raise exception 'Zone total changed'; end if;
  if has_function_privilege('authenticated','public.pickup_inventory_zone_board(text)','EXECUTE') then raise exception 'Zone board bypasses API permissions'; end if;
  if has_function_privilege('authenticated','public.pickup_inventory_riders(text)','EXECUTE') or has_function_privilege('anon','public.pickup_inventory_ward_zones(text,text,text)','EXECUTE') then raise exception 'RPC bypasses API permissions'; end if;
end $test$;
