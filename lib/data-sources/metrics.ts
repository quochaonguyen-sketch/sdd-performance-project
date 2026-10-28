type TimedJob = { status:string; started_at:string|null; finished_at:string|null };

export function jobDurationMs(job:TimedJob|undefined,serverTime:string):number|null {
  if(!job?.started_at)return null;
  const end=job.finished_at??(["RUNNING","CANCEL_REQUESTED"].includes(job.status)?serverTime:null);
  if(!end)return null;
  const duration=Date.parse(end)-Date.parse(job.started_at);
  return Number.isFinite(duration)&&duration>=0?duration:null;
}

export function sourceFailureRate(jobs:ReadonlyArray<{source_id:string;status:string}>,sourceId:string) {
  const completed=jobs.filter(job=>job.source_id===sourceId&&["SUCCEEDED","FAILED"].includes(job.status));
  const failed=completed.filter(job=>job.status==="FAILED").length;
  return {failed,total:completed.length,percent:completed.length?failed/completed.length*100:null};
}
