do $$
declare day date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; report jsonb; x integer;
begin
 if has_function_privilege('anon','public.sync_pickup_point_catalog(text,jsonb)','execute') or has_function_privilege('authenticated','public.publish_pickup_shop_volume(text,date,jsonb,integer,integer)','execute') then raise exception 'Public write access'; end if;
 perform public.sync_pickup_point_catalog('integration-hub','[{"station_id":"integration-hub","pickup_point_id":"fixture-ado","pup_code":"fixture-ado","shop_name":"Fixture","shop_address":"Fixture address","route_name":"Fixture route"}]'::jsonb);
 if exists(select 1 from public.pickup_assignments where assignment_key='catalog:integration-hub:fixture-ado' and assigned_at is not null) then raise exception 'Collector fabricated an assignment'; end if;
 for x in 1..30 loop
  perform public.publish_pickup_shop_volume('integration-hub',day-x,case when x=30 then '[{"pickup_point_id":"fixture-ado","total_orders":30}]'::jsonb else '[]'::jsonb end,case when x=30 then 30 else 0 end,0);
 end loop;
 perform public.publish_pickup_shop_volume('integration-hub',day,'[{"pickup_point_id":"fixture-ado","total_orders":9000}]'::jsonb,9000,0);
 report:=public.pickup_shop_ado('integration-hub');
 if (report->>'days')::int<>30 or (report->'shops'->0->>'ado')::numeric<>1 then raise exception 'ADO must include zero days and exclude today'; end if;
 delete from public.pickup_shop_volume_days where station_id='integration-hub' and report_date=day-2;
 report:=public.pickup_shop_ado('integration-hub');
 if (report->>'days')::int<>29 or (report->'shops'->0->>'ado')::numeric<>2 then raise exception 'ADO must round up using completed day count'; end if;
 delete from public.pickup_shop_volume_days where station_id='integration-hub' and report_date not in (day-30,day-1,day);
 perform public.publish_pickup_shop_volume('integration-hub',day-2,'[{"pickup_point_id":"fixture-ado","total_orders":999}]'::jsonb,1000,1);
 report:=public.pickup_shop_ado('integration-hub');
 if (report->>'days')::int<>2 or (report->'shops'->0->>'ado')::numeric<>15 then raise exception 'Two completed days must average to 15; exclude incomplete day'; end if;
 perform public.publish_pickup_shop_volume('integration-hub',day-30,'[{"pickup_point_id":"fixture-ado","total_orders":31}]'::jsonb,31,0);
 report:=public.pickup_shop_ado('integration-hub');
 if (report->'shops'->0->>'ado')::numeric<>16 then raise exception '15.5 ADO must round up to 16'; end if;
 perform public.sync_pickup_point_catalog('integration-hub','[{"station_id":"integration-hub","pickup_point_id":"fixture-b","pup_code":"fixture-b","shop_name":"Second fixture","shop_address":"Fixture address","route_name":"ZZZ route"}]'::jsonb);
 perform public.publish_pickup_shop_volume('integration-hub',day-1,'[{"pickup_point_id":"fixture-b","total_orders":60}]'::jsonb,60,0);
 report:=public.pickup_points_page('integration-hub','fixture','all',1,1,'ado_desc');
 if report->'rows'->0->>'pickup_point_id'<>'fixture-b' then raise exception 'ADO descending must sort before pagination'; end if;
 if (report->>'ado_days')::int<>2 or (report->'rows'->0->>'ado')::numeric<>30 or (report->'rows'->0->>'ado_days')::int<>2 then raise exception 'Page must include matching ADO and day count'; end if;
 report:=public.pickup_points_page('integration-hub','fixture','all',2,1,'ado_desc');
 if report->'rows'->0->>'pickup_point_id'<>'fixture-ado' then raise exception 'ADO page two is wrong'; end if;
 report:=public.pickup_points_page('integration-hub','fixture','Fixture route',1,1,'ado_desc');
 if report->'rows'->0->>'pickup_point_id'<>'fixture-ado' then raise exception 'Route filter must apply to ADO sorting'; end if;
 report:=public.pickup_points_page('integration-hub','fixture-ado','all',1,1);
 if jsonb_array_length(report->'rows')<>1 then raise exception 'PUP pagination failed'; end if;
 if (report->'rows'->0->>'ado')::numeric<>16 then raise exception 'Route sorting must still include rounded ADO'; end if;
 begin
  perform public.publish_pickup_shop_volume('integration-hub',day-1,'[{"pickup_point_id":"fixture-ado","total_orders":1}]'::jsonb,999,0);
  raise exception 'Mismatched counts accepted';
 exception when others then if sqlerrm<>'Shop volume does not reconcile' then raise; end if; end;
 delete from public.pickup_shop_volume_days where station_id='integration-hub';
 report:=public.pickup_points_page('integration-hub','fixture-ado','all',1,1,'ado_desc');
 if (report->>'ado_days')::int<>0 or report->'rows'->0->>'ado' is not null then raise exception 'Missing coverage must not become zero ADO'; end if;
end $$;
