-- Only upgrade the LH capability gate and phase validation.
do $upgrade$
declare fn text;
begin
 fn:=pg_get_functiondef('public.claim_data_source_job(text)'::regprocedure);
 fn:=replace(fn,'%lh-dashboard%','%lh-unseal%');
 if position('%lh-unseal%' in fn)=0 then raise exception 'LH claim capability gate not found'; end if;
 execute fn;
 fn:=pg_get_functiondef('public.publish_linehaul(uuid,text,text,jsonb,timestamptz)'::regprocedure);
 fn:=replace(fn,'%lh-dashboard%','%lh-unseal%');
 fn:=replace(fn,'''at_hub'',''departed''','''at_hub'',''unloading'',''departed''');
 if position('%lh-unseal%' in fn)=0 or position('''unloading''' in fn)=0 then raise exception 'LH unloading publisher upgrade missing'; end if;
 execute fn;
end $upgrade$;
notify pgrst,'reload schema';
