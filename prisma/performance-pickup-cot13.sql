-- Route Performance to collectors using the new actual-pickup-time boundary.
do $upgrade$
declare fn text; needle text:='where status=''QUEUED'' and ';
begin
 fn:=pg_get_functiondef('public.claim_data_source_job(text)'::regprocedure);
 if position('%pick13%' in fn)=0 then
  if position(needle in fn)=0 then raise exception 'Claim predicate not found'; end if;
  fn:=replace(fn,needle,needle||'(source_id<>''performance'' or exists(select 1 from public.data_source_workers w where w.id=p_worker and w.version like ''%pick13%'')) and ');
  execute fn;
 end if;
end $upgrade$;
notify pgrst,'reload schema';
