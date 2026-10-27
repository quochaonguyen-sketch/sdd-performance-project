do $$
declare
  actor uuid;
  fixture_feedback_id uuid;
  fixture_update_id uuid;
begin
  select id into actor from auth.users limit 1;
  if actor is null then raise exception 'An auth user is required for the persistence check'; end if;
  insert into public.user_feedback(user_id, author_name, kind, title, content)
    values(actor, 'Integration fixture', 'BUG', 'Test report', 'Test content for feedback persistence.') returning id into fixture_feedback_id;
  update public.user_feedback set status = 'RESOLVED', response = 'Fixed in integration check.' where id = fixture_feedback_id;
  if not exists(select 1 from public.user_feedback where id = fixture_feedback_id and status = 'RESOLVED' and response = 'Fixed in integration check.') then raise exception 'Review did not persist'; end if;
  if (select count(*) from public.feedback_notifications n where n.feedback_id = fixture_feedback_id and n.user_id = actor) <> 1 then raise exception 'Owner notification missing'; end if;
  update public.user_feedback set updated_at = now() where id = fixture_feedback_id;
  if (select count(*) from public.feedback_notifications n where n.feedback_id = fixture_feedback_id) <> 1 then raise exception 'No-op review created duplicate notification'; end if;
  update public.user_feedback set response = 'Updated reply.' where id = fixture_feedback_id;
  if (select count(*) from public.feedback_notifications n where n.feedback_id = fixture_feedback_id and n.response = 'Updated reply.') <> 1 then raise exception 'Reply edit did not notify owner'; end if;
  insert into public.product_updates(author_id, title, content) values(actor, 'Test announcement', 'A test fix announcement for users.') returning id into fixture_update_id;
  insert into public.product_update_reads(user_id, update_id) values(actor, fixture_update_id) on conflict do nothing;
  insert into public.product_update_reads(user_id, update_id) values(actor, fixture_update_id) on conflict do nothing;
  if (select count(*) from public.product_update_reads r where r.user_id = actor and r.update_id = fixture_update_id) <> 1 then raise exception 'Read mark must be idempotent'; end if;
  if exists(select 1 from unnest(array['user_feedback','product_updates','product_update_reads']) t where has_table_privilege('authenticated', 'public.' || t, 'select') or has_table_privilege('anon', 'public.' || t, 'insert')) then raise exception 'Unexpected direct access'; end if;
  if has_table_privilege('authenticated', 'public.feedback_notifications', 'select') or has_table_privilege('authenticated','public.web_vital_samples','select') or has_function_privilege('authenticated','public.web_vital_summary()','execute') then raise exception 'Private telemetry or notification access leaked'; end if;
  insert into public.web_vital_samples(metric_id,name,value,rating,path,device)
    select 'integration-' || value, 'LCP', value, 'good', '/__integration_fixture', 'desktop' from unnest(array[100,200,300,400]) value;
  if not exists(select 1 from public.web_vital_summary() s where s.path = '/__integration_fixture' and s.p75 = 325 and s.samples = 4) then raise exception 'P75 summary is incorrect'; end if;
end $$;
