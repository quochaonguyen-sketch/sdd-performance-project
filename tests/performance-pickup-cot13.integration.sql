do $test$
declare job uuid:=gen_random_uuid(); result jsonb;
begin
 -- Fixtures and temporary queue changes are entirely rolled back by the runner.
 update public.data_source_jobs set status='CANCELLED',phase='finished' where status='QUEUED';
 insert into public.data_source_workers(id,hostname,version,concurrency) values
 ('qa-old-pick13','test','1.4-lh-unseal',1),('qa-new-pick13','test','1.5-pick13-lh-unseal',1);
 insert into public.data_source_jobs(id,source_id,report_date,status) values(job,'performance',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'QUEUED');
 if public.claim_data_source_job('qa-old-pick13') is not null then raise exception 'Old collector claimed new pickup COT policy'; end if;
 result:=public.claim_data_source_job('qa-new-pick13');
 if result->>'id' is distinct from job::text then raise exception 'Updated collector did not claim performance'; end if;
 if position('%lh-unseal%' in pg_get_functiondef('public.claim_data_source_job(text)'::regprocedure))=0 then raise exception 'LH capability gate lost'; end if;
end $test$;
