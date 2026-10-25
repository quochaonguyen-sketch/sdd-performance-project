-- UTC 17:00 is midnight in Vietnam. The database closes the day even if the PC is off.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('sdd-onhold-close-day','0 17 * * *','select public.finalize_onhold_days();');
