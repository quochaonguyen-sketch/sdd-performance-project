// Stop only the two known legacy background daemons, while inventory claims are blocked.
// Never closes the launcher GUI or a user browser. Refuses to interrupt RUNNING inventory jobs.
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('node:child_process');
const db = new PrismaClient();
const query = `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and ($_.CommandLine -match '(?i)C:\\\\code\\\\sdd-web-data\\\\launcher\\.py[\\" ]+--worker(?:\\s|$)' -or $_.CommandLine -match '(?i)-m sdd_data\\.pickup_realtime --interval 300(?:\\s|$)') } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`;
function powershell(command) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Could not inspect/stop legacy worker: ' + result.stderr);
  return result.stdout.trim();
}
(async () => {
  const raw = powershell(query);
  const found = raw ? JSON.parse(raw) : [];
  const processes = Array.isArray(found) ? found : [found];
  const ids = processes.map(p => p.ProcessId);
  if (ids.some(id => !Number.isInteger(id) || id < 1)) throw new Error('Invalid process identifier');
  if (!ids.length) { console.log('No legacy background daemon found; no preferences changed.'); return; }
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('LOCK TABLE public.lmhub_fetch_jobs IN SHARE MODE');
    const [state] = await tx.$queryRawUnsafe("select count(*)::int as running from public.lmhub_fetch_jobs where status='RUNNING'");
    if (state.running) throw new Error('Inventory is RUNNING; leave it running and migrate after completion.');
    const fresh = powershell(query);
    const freshValue = fresh ? JSON.parse(fresh) : [];
    const freshProcesses = Array.isArray(freshValue) ? freshValue : [freshValue];
    const checked = freshProcesses.filter(p => ids.includes(p.ProcessId));
    if (checked.length) powershell(`Stop-Process -Id @(${checked.map(p=>p.ProcessId).join(',')}) -ErrorAction Stop`);
    const inventory = checked.some(p=>p.CommandLine.includes('launcher.py')&&!p.CommandLine.includes('--queue-only'));
    const realtime = checked.some(p=>p.CommandLine.includes('sdd_data.pickup_realtime'));
    for (const source of [...(inventory?['pickup_inventory','delivery_inventory']:[]),...(realtime?['pickup_realtime']:[])]) {
      await tx.$executeRawUnsafe("update public.data_source_settings set auto_enabled=true,next_run_at=now()+make_interval(secs=>interval_seconds),updated_at=now() where source_id=$1",source);
    }
    console.log(`Stopped ${checked.length} legacy Python processes at an idle queue; retained existing automatic schedules.`);
  }, { timeout: 30000 });
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
