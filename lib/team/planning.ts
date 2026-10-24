import { addDays, isArchivedStaff, type Staff, type StaffShift } from "./model.ts";

export type BreakWindow = { start: number; end: number }; // Minutes after shift start.
export type ShiftTemplate = { id: string; name: string; start_minute: number; end_minute: number; fte_breaks: BreakWindow[]; bpo_breaks: BreakWindow[]; active: boolean; note: string; updated_at?: string };
export type StaffingPool = "OPS" | "FTE" | "BPO";
export type StaffingTarget = { area: string; pool: StaffingPool; day_key: string; hour: number; required: number };
export type PlanningShift = StaffShift & { template_id?: string | null };
export type PlanningStaff = Staff & { updated_at?: string };
export type CoverageCell = { day: string; hour: number; area: string; available: number; required: number; deficit: number; surplus: number };
export type PlanChange = { staff_id: string; full_name: string; coverage: string; work_date: string; from_shift: string; to_shift: string; template_id: string; expected_updated_at: string; staff_updated_at: string; expected_previous_at: string | null; expected_next_at: string | null; gain: number };
export const PLANNING_AREAS = ["KV1", "KV2", "KV3", "KV4", "KV5"];
export const timeLabel = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const templateCode = (t: ShiftTemplate) => `${timeLabel(t.start_minute)}-${timeLabel(t.end_minute)}`;
export function duration(start: number, end: number) { return end > start ? end - start : end + 1440 - start; }
export function parseWorkingShift(raw: string) {
  const m = raw.trim().match(/^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [sh, sm, eh, em] = m.slice(1).map(Number);
  if (sh > 23 || eh > 24 || sm > 59 || em > 59 || eh === 24 && em !== 0) return null;
  const start = sh * 60 + sm, end = eh * 60 + em;
  if (duration(start, end) > 720 || duration(start, end) < 60) return null;
  return { start, end: start + duration(start, end) };
}
export function validBreaks(breaks: BreakWindow[], length: number) {
  return breaks.every(b => Number.isInteger(b.start) && Number.isInteger(b.end) && b.start >= 0 && b.end > b.start && b.end <= length)
    && [...breaks].sort((a, b) => a.start - b.start).every((b, i, all) => i === 0 || all[i - 1].end <= b.start);
}
export function inPool(person: Staff, pool: StaffingPool) {
  return !isArchivedStaff(person) && person.status.toLowerCase() === "active" && (pool === "OPS" ? ["FTE", "BPO"].includes(person.role) : person.role === pool);
}
export function targetFor(targets: StaffingTarget[], area: string, pool: StaffingPool, day: string, hour: number) {
  const exact = targets.find(t => t.area === area && t.pool === pool && t.day_key === day && t.hour === hour);
  if (exact) return Number(exact.required);
  const weekday = String(new Date(`${day}T12:00:00Z`).getUTCDay());
  const weekly = targets.find(t => t.area === area && t.pool === pool && t.day_key === weekday && t.hour === hour);
  return weekly ? Number(weekly.required) : PLANNING_AREAS.includes(area) && hour >= 7 && hour < 23 ? 1 : 0;
}
function staffHours(row: PlanningShift, person: Staff, templates: ShiftTemplate[], day: string) {
  const parsed = parseWorkingShift(row.shift);
  const hours = Array<number>(24).fill(0);
  if (!parsed) return hours;
  const offset = Math.round((Date.parse(row.work_date) - Date.parse(day)) / 86400000) * 1440;
  const template = templates.find(t => t.id === row.template_id && templateCode(t) === row.shift) ?? templates.find(t => templateCode(t) === row.shift);
  const breaks = template ? person.role === "BPO" ? template.bpo_breaks : template.fte_breaks : [];
  const windows: Array<[number, number]> = [[offset + parsed.start, offset + parsed.end]];
  for (const b of breaks) {
    const start = offset + parsed.start + b.start, end = offset + parsed.start + b.end;
    const next: Array<[number, number]> = [];
    for (const [a, z] of windows) {
      if (end <= a || start >= z) next.push([a, z]);
      else { if (a < start) next.push([a, start]); if (end < z) next.push([end, z]); }
    }
    windows.splice(0, windows.length, ...next);
  }
  for (let h = 0; h < 24; h++) hours[h] = windows.reduce((sum, [a, z]) => sum + Math.max(0, Math.min(z, (h + 1) * 60) - Math.max(a, h * 60)) / 60, 0);
  return hours;
}
export function analyzeCoverage(staff: Staff[], shifts: PlanningShift[], templates: ShiftTemplate[], targets: StaffingTarget[], days: string[], pool: StaffingPool, areas = PLANNING_AREAS) {
  const people = staff.filter(p => inPool(p, pool)), byId = new Map(people.map(p => [p.id, p]));
  const availability = new Map<string, number>();
  for (const day of days) for (const row of shifts) {
    if (row.work_date !== day && row.work_date !== addDays(day, -1)) continue;
    const person = byId.get(row.staff_id); if (!person || !person.areas.length) continue;
    const hours = staffHours(row, person, templates, day);
    // One person is one unit across every area they cover, including legacy KV6/SPF.
    const share = 1 / person.areas.length;
    for (const area of person.areas) for (let h = 0; h < 24; h++) {
      const key = `${day}:${area}:${h}`; availability.set(key, (availability.get(key) ?? 0) + hours[h] * share);
    }
  }
  const cells: CoverageCell[] = [];
  for (const day of days) for (const area of areas) for (let hour = 0; hour < 24; hour++) {
    const available = availability.get(`${day}:${area}:${hour}`) ?? 0, required = targetFor(targets, area, pool, day, hour);
    cells.push({ day, area, hour, available, required, deficit: Math.max(0, required - available), surplus: Math.max(0, available - required) });
  }
  return cells;
}
export function coverageSummary(cells: CoverageCell[]) {
  return { availableHours: cells.reduce((n, c) => n + c.available, 0), requiredHours: cells.reduce((n, c) => n + c.required, 0), deficitHours: cells.reduce((n, c) => n + c.deficit, 0), surplusHours: cells.reduce((n, c) => n + c.surplus, 0) };
}
export function hourContributors(staff: Staff[], shifts: PlanningShift[], templates: ShiftTemplate[], day: string, hour: number, pool: StaffingPool, areas: string[]) {
  const result: Array<{ id: string; name: string; role: string; shift: string; coverage: string; contribution: number }> = [];
  for (const person of staff.filter(p=>inPool(p,pool))) {
    let contribution = 0; const labels: string[] = [];
    const share = person.areas.filter(a=>areas.includes(a)).length / Math.max(1,person.areas.length);
    if (!share) continue;
    for (const row of shifts.filter(r=>r.staff_id===person.id && (r.work_date===day || r.work_date===addDays(day,-1)))) {
      const amount = staffHours(row,person,templates,day)[hour]*share;
      if (amount > 0) { contribution += amount; labels.push(row.shift); }
    }
    if (contribution > 0) result.push({ id: person.id, name: person.full_name, role: person.role, shift: labels.join(" + "), coverage: person.coverage, contribution });
  }
  return result;
}
function score(cells: CoverageCell[]) {
  return cells.reduce((n, c) => n + c.deficit ** 2 * 20 + (c.required > 0 ? c.surplus ** 2 : c.available ** 2) * .15, 0);
}
export function suggestShiftPlan(staff: PlanningStaff[], shifts: PlanningShift[], templates: ShiftTemplate[], targets: StaffingTarget[], day: string, pool: StaffingPool, area = "all", restHours = 11, maxMoves = 8) {
  const allAreas = [...new Set([...PLANNING_AREAS, ...staff.flatMap(p => p.areas)])];
  // Evaluate every affected area/day, so a local improvement cannot hide losses elsewhere.
  const days = [addDays(day, -1), day, addDays(day, 1)];
  const baseline = analyzeCoverage(staff, shifts, templates, targets, days, pool, allAreas);
  const available = baseline.map(c=>c.available), required = baseline.map(c=>c.required);
  const deltas = new Map<string, number[]>();
  const contributions = new Map<string, number[]>();
  function contribution(row: PlanningShift, person: Staff) {
    const values: number[] = [], share=1/person.areas.length;
    for (const targetDay of days) {
      const hours=staffHours(row,person,templates,targetDay);
      for (const a of allAreas) for (let h=0;h<24;h++) values.push(person.areas.includes(a)?hours[h]*share:0);
    }
    return values;
  }
  function evaluate(delta: number[]) {
    let score=0, deficit=0;
    for(let i=0;i<available.length;i++) {
      const value=available[i]+delta[i], missing=Math.max(0,required[i]-value), extra=Math.max(0,value-required[i]);
      deficit+=missing;score+=missing**2*20+(required[i]>0?extra**2:value**2)*.15;
    }
    return {score,deficit};
  }
  const working = shifts.map(row => ({ ...row })), changed = new Set<string>(), changes: PlanChange[] = [];
  const people = staff.filter(p => inPool(p, pool) && p.areas.length && (area === "all" || p.areas.includes(area))).sort((a,b) => a.id.localeCompare(b.id));
  let beforeScore = score(baseline);
  let beforeDeficit = coverageSummary(baseline).deficitHours;
  for (let iteration = 0; iteration < maxMoves; iteration++) {
    let best: { index: number; person: PlanningStaff; template: ShiftTemplate; gain: number; deficit: number; delta: number[]; previous: PlanningShift | undefined; next: PlanningShift | undefined } | null = null;
    for (const person of people) {
      if (changed.has(person.id)) continue;
      const index = working.findIndex(r => r.staff_id === person.id && r.work_date === day);
      if (index < 0) continue;
      const row = working[index], current = parseWorkingShift(row.shift);
      if (!current || !row.updated_at || !person.updated_at) continue; // OFF, leave and ambiguous cells stay untouched.
      const currentTemplate = templates.find(t=>t.id===row.template_id && templateCode(t)===row.shift) ?? templates.find(t=>templateCode(t)===row.shift);
      const currentBreaks = currentTemplate ? person.role==="BPO" ? currentTemplate.bpo_breaks : currentTemplate.fte_breaks : [];
      // Missing break configuration must never look like extra free capacity.
      if (!currentBreaks.length) continue;
      const currentBreakMinutes = currentBreaks.reduce((n,b)=>n+b.end-b.start,0);
      const previous = shifts.find(r => r.staff_id === person.id && r.work_date === addDays(day,-1));
      const next = shifts.find(r => r.staff_id === person.id && r.work_date === addDays(day,1));
      const prevShift = previous ? parseWorkingShift(previous.shift) : null, nextShift = next ? parseWorkingShift(next.shift) : null;
      // A mixed or unrecognized adjacent cell has unknown working hours.
      if ([previous, next].some(r => r && !parseWorkingShift(r.shift) && !["OFF","AL","SL","PH","NPL","HL","KL","ML","CL"].includes(r.shift.trim().toUpperCase()))) continue;
      for (const template of templates.filter(t => t.active)) {
        if (duration(template.start_minute, template.end_minute) !== current.end - current.start) continue;
        const candidateBreaks = person.role==="BPO" ? template.bpo_breaks : template.fte_breaks;
        if (!candidateBreaks.length || candidateBreaks.reduce((n,b)=>n+b.end-b.start,0)!==currentBreakMinutes) continue;
        const code = templateCode(template);
        if (code === row.shift && (!row.template_id || row.template_id === template.id)) continue;
        const end = template.start_minute + duration(template.start_minute, template.end_minute);
        if (prevShift && template.start_minute + 1440 - prevShift.end < restHours * 60) continue;
        if (nextShift && nextShift.start + 1440 - end < restHours * 60) continue;
        const key=person.id+":"+template.id;
        let delta=deltas.get(key);
        if (!delta) {
          let original=contributions.get(person.id);
          if (!original) { original=contribution(row,person);contributions.set(person.id,original); }
          delta=contribution({...row,shift:code,template_id:template.id},person).map((v,i)=>v-original![i]);
          deltas.set(key,delta);
        }
        const evaluation=evaluate(delta), gain=beforeScore-evaluation.score;
        if (evaluation.deficit <= beforeDeficit + 1e-6 && gain > .05 && (!best || gain > best.gain)) best = { index, person, template, gain, deficit:evaluation.deficit, delta, previous, next };
      }
      working[index] = row;
    }
    if (!best) break;
    const row = working[best.index];
    changes.push({ staff_id: best.person.id, full_name: best.person.full_name, coverage: best.person.coverage, work_date: day, from_shift: row.shift, to_shift: templateCode(best.template), template_id: best.template.id, expected_updated_at: row.updated_at!, staff_updated_at: best.person.updated_at!, expected_previous_at: best.previous?.updated_at ?? null, expected_next_at: best.next?.updated_at ?? null, gain: best.gain });
    working[best.index] = { ...row, shift: templateCode(best.template), template_id: best.template.id };
    changed.add(best.person.id); beforeScore -= best.gain;
    for(let i=0;i<available.length;i++) available[i]+=best.delta[i];
    beforeDeficit = best.deficit;
  }
  const before = coverageSummary(baseline), afterCells = analyzeCoverage(staff, working, templates, targets, days, pool, allAreas), after = coverageSummary(afterCells);
  return { changes, before, after, day, pool, area, restHours, maxMoves, beforeScore: score(baseline), afterScore: score(afterCells), simulated: working, targetDayBefore: coverageSummary(baseline.filter(c=>c.day===day)), targetDayAfter: coverageSummary(afterCells.filter(c=>c.day===day)) };
}
