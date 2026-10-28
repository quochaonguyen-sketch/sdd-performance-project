import test from "node:test";
import assert from "node:assert/strict";
import {jobDurationMs,sourceFailureRate} from "../lib/data-sources/metrics.ts";

test("duration measures worker execution, including failed jobs, without guessing missing timestamps",()=>{
 const job={status:"SUCCEEDED",started_at:"2026-10-28T12:00:00.100Z",finished_at:"2026-10-28T12:00:01.650Z"};
 assert.equal(jobDurationMs(job,"2026-10-28T12:05:00Z"),1550);
 assert.equal(jobDurationMs({...job,status:"FAILED"},""),1550);
 assert.equal(jobDurationMs({...job,status:"RUNNING",finished_at:null},"2026-10-28T12:00:02.100Z"),2000);
 assert.equal(jobDurationMs({...job,status:"CANCEL_REQUESTED",finished_at:null},"2026-10-28T12:00:02.100Z"),2000);
 for(const changed of [{started_at:null},{started_at:"invalid"},{finished_at:"2026-10-28T11:00:00Z"},{finished_at:null},{status:"QUEUED",started_at:null,finished_at:null}])assert.equal(jobDurationMs({...job,...changed},"2026-10-28T12:05:00Z"),null);
 assert.equal(jobDurationMs(undefined,""),null);
});

test("failure percentage is scoped to the source and excludes unfinished/cancelled jobs",()=>{
 const jobs=["SUCCEEDED","FAILED","SUCCEEDED","QUEUED","RUNNING","CANCEL_REQUESTED","CANCELLED"].map(status=>({source_id:"linehaul",status}));
 jobs.push({source_id:"other",status:"FAILED"});
 const result=sourceFailureRate(jobs,"linehaul");assert.equal(result.failed,1);assert.equal(result.total,3);assert.ok(Math.abs(result.percent!-100/3)<1e-10);
 assert.deepEqual(sourceFailureRate(jobs,"none"),{failed:0,total:0,percent:null});
 assert.equal(sourceFailureRate([{source_id:"linehaul",status:"SUCCEEDED"}],"linehaul").percent,0);
 assert.equal(sourceFailureRate([{source_id:"linehaul",status:"FAILED"}],"linehaul").percent,100);
});
