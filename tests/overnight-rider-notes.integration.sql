do $$
begin
 insert into public.overnight_hold_snapshots(cutoff_date) values('2099-02-01'),('2099-02-02');
 insert into public.overnight_hold_rider_notes(cutoff_date,rider_code,note,updated_by)
 values('2099-02-01','test-rider','Gọi rider trước 8h','Dispatcher'),('2099-02-02','test-rider','Ngày sau','Dispatcher');
 update public.overnight_hold_rider_notes set note='Đã liên hệ' where cutoff_date='2099-02-01' and rider_code='test-rider';
 if not exists(select 1 from public.overnight_hold_rider_notes where cutoff_date='2099-02-01' and note='Đã liên hệ')
 or not exists(select 1 from public.overnight_hold_rider_notes where cutoff_date='2099-02-02' and note='Ngày sau') then raise exception 'Rider notes mixed between days'; end if;
 if has_table_privilege('anon','public.overnight_hold_rider_notes','SELECT')
 or has_table_privilege('authenticated','public.overnight_hold_rider_notes','UPDATE') then raise exception 'Rider notes publicly accessible'; end if;
 begin
  update public.overnight_hold_rider_notes set note=repeat('x',2001) where cutoff_date='2099-02-01';
  raise exception 'Oversized note accepted';
 exception when check_violation then null; end;
end $$;
