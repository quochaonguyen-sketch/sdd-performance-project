import test from "node:test";
import assert from "node:assert/strict";
import { performanceSessionUrl } from "../lib/performance/database-url.ts";
const pooled="postgresql://postgres.sample:test-only@aws-0.example.pooler.supabase.com:6543/postgres?pgbouncer=true";
const session=pooled.replace(":6543",":5432");
test("session optimization stays on the configured project and role with a bounded pool",()=>{
  const selected=new URL(performanceSessionUrl(pooled,session)!);
  assert.equal(selected.port,"5432");assert.equal(selected.searchParams.get("pgbouncer"),null);assert.equal(selected.searchParams.get("connection_limit"),"3");
  assert.equal(performanceSessionUrl(pooled,session.replace("postgres.sample","postgres.other")),undefined);
  assert.equal(performanceSessionUrl(pooled,session.replace("test-only","different-secret")),undefined);
  assert.equal(performanceSessionUrl(pooled,session,true),undefined);
  assert.equal(performanceSessionUrl(pooled,undefined),undefined);
});
