// One-way polling: this process reads Sheets and never writes back to it.
let db;
async function main() {
  const fs = await import('node:fs'), path = await import('node:path');
  const { default: Module } = await import('node:module'), { default: ts } = await import('typescript');
  const load = Module.createRequire(__filename);
  Module._extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, f);
  const { googleSheetsAccessToken } = load('../lib/google/off-schedule.ts');
  const { parseRiderPlan, RIDER_PLAN_ID, RIDER_PLAN_TAB } = load('../lib/google/rider-plan.ts');
  const { PrismaClient } = await import('@prisma/client');
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0], connection = new URL(process.env.DATABASE_URL);
  if (!connection.hostname.includes(ref) && !decodeURIComponent(connection.username).includes(ref)) throw Error('Database project mismatch');
  const folder = path.join(process.env.LOCALAPPDATA, 'SDD', 'rider-sheet-sync');
  fs.mkdirSync(folder, { recursive: true });
  const stateFile = path.join(folder, 'status.json'), lockFile = path.join(folder, 'process.lock');
  const lock = fs.openSync(lockFile, 'wx');
  db = new PrismaClient();
  const watch = process.argv.includes('--watch'), preview = process.argv.includes('--preview');
  try {
    do {
      try {
        const token = await googleSheetsAccessToken();
        const range = encodeURIComponent(`'${RIDER_PLAN_TAB}'!A1:Z5001`);
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${RIDER_PLAN_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
        const payload = await response.json();
        if (!response.ok) throw Error(`Google Sheets ${response.status}: ${payload.error?.message ?? 'Không đọc được nguồn'}`);
        const parsed = parseRiderPlan(payload.values ?? []);
        const result = await db.$transaction(async tx => {
          await tx.$executeRawUnsafe("select pg_advisory_xact_lock(hashtextextended('sdd-rider-plan-sheet',0))");
          const candidates = await tx.$queryRawUnsafe(`with source as (select * from jsonb_to_recordset($1::jsonb) as r(rider_code text,kv text,cot text,full_name text,home_district text,pickup_district text,pickup_ward text,delivery_district text,delivery_ward text,metadata jsonb))
            select s.*,r.id as existing_id from source s left join public.riders r using(rider_code)
            where r.id is null or (r.kv,r.cot,r.full_name,r.home_district,r.pickup_district,r.pickup_ward,r.delivery_district,r.delivery_ward,r.raw_data->'rider_plan')
              is distinct from (s.kv,s.cot,s.full_name,s.home_district,s.pickup_district,s.pickup_ward,s.delivery_district,s.delivery_ward,s.metadata)`, JSON.stringify(parsed.rows));
          const inserted = candidates.filter(r => !r.existing_id).length, updated = candidates.length - inserted;
          if (!preview && candidates.length) {
            await tx.$executeRawUnsafe(`insert into public.riders(rider_code,name,full_name,kv,cot,home_district,pickup_district,pickup_ward,delivery_district,delivery_ward,raw_data)
              select rider_code,full_name,full_name,kv,cot,home_district,pickup_district,pickup_ward,delivery_district,delivery_ward,jsonb_build_object('rider_plan',metadata)
              from jsonb_to_recordset($1::jsonb) as s(rider_code text,kv text,cot text,full_name text,home_district text,pickup_district text,pickup_ward text,delivery_district text,delivery_ward text,metadata jsonb)
              on conflict(rider_code) do update set name=excluded.name,full_name=excluded.full_name,kv=excluded.kv,cot=excluded.cot,home_district=excluded.home_district,pickup_district=excluded.pickup_district,pickup_ward=excluded.pickup_ward,delivery_district=excluded.delivery_district,delivery_ward=excluded.delivery_ward,raw_data=coalesce(riders.raw_data,'{}'::jsonb)||excluded.raw_data,updated_at=now()`, JSON.stringify(candidates));
          }
          return { inserted, updated, unchanged: parsed.rows.length - candidates.length };
        }, { timeout: 60000 });
        const status = { status: preview ? 'PREVIEW' : 'SYNCED', checkedAt: new Date().toISOString(), spreadsheetId: RIDER_PLAN_ID, tab: RIDER_PLAN_TAB, intervalSeconds: 60, ...result, validRows: parsed.rows.length, skippedRows: parsed.issues.length, issues: parsed.issues };
        fs.writeFileSync(stateFile, JSON.stringify(status, null, 2));
        console.log(JSON.stringify({ ...status, issues: undefined }));
      } catch (error) {
        fs.writeFileSync(stateFile, JSON.stringify({ status: 'ERROR', checkedAt: new Date().toISOString(), error: error.message }));
        console.error(error.message);
        if (!watch) throw error;
      }
      if (watch) await new Promise(resolve => setTimeout(resolve, 60000));
    } while (watch);
  } finally { await db.$disconnect(); fs.closeSync(lock); fs.unlinkSync(lockFile); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
