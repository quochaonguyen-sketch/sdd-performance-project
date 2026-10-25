import test from "node:test";
import assert from "node:assert/strict";
import { DATA_SOURCES, sourceAction, sourceAllowed } from "../lib/data-sources/catalog.ts";
test("eight allowlisted sources; role and per-source permission enforced",()=>{
  assert.equal(DATA_SOURCES.length,8);
  assert.equal(sourceAllowed("member",{manage_pickup:true},"pickup_inventory"),false);
  assert.equal(sourceAllowed("leader",{manage_pickup:true},"performance"),false);
  assert.equal(sourceAllowed("leader",{manage_pickup:true},"pickup_inventory"),true);
  assert.equal(sourceAllowed("admin",{},"shell"),false);
  assert.equal(sourceAllowed("leader",{manage_pickup:true},"return_inventory"),false);
  assert.equal(sourceAllowed("leader",{manage_return:true},"return_inventory"),true);
  assert.equal(sourceAllowed("leader",{manage_performance:true},"onhold_daily"),true);
  assert.equal(sourceAllowed("leader",{manage_pickup:true},"onhold_daily"),false);
});
test("daily schedules validate wall-clock time, modes and report-day choices",()=>{
  const today="2026-10-25";
  const command=sourceAction({source:"pickup_volume",action:"auto",enabled:true,mode:"daily",time:"18:00",offset:0},today);
  assert.equal(command.mode,"daily");assert.equal(command.time,"18:00");assert.equal(command.offset,0);
  assert.equal(sourceAction({source:"delivery_volume",action:"auto",enabled:true,mode:"daily",time:"06:00",offset:1},today).offset,1);
  for(const extra of [{time:"24:00"},{time:"6:00"},{time:"18:99"},{mode:"cron"},{offset:2},{offset:"1"}])assert.throws(()=>sourceAction({source:"pickup_volume",action:"auto",enabled:true,mode:"daily",time:"18:00",offset:0,...extra},today));
  assert.throws(()=>sourceAction({source:"pickup_inventory",action:"auto",enabled:true,mode:"daily",time:"18:00",offset:1},today));
  assert.equal(sourceAction({source:"pickup_realtime",action:"auto",enabled:true,interval:900},today).mode,"interval");
});
test("commands reject arbitrary source, invalid dates and interval",()=>{
  for(const body of [{source:"cmd",action:"run"},{source:"performance",action:["run"]},{source:"performance",action:"run",day:"2026-02-30"},{source:"performance",action:"run",day:"2026-10-26"},{source:"performance",action:"auto",enabled:true,interval:1}])assert.throws(()=>sourceAction(body,"2026-10-25"));
  assert.equal(sourceAction({source:"pickup_inventory",action:"run",day:"2026-10-01"},"2026-10-25").day,"2026-10-25");
  assert.equal(sourceAction({source:"performance",action:"run",day:"2026-10-01"},"2026-10-25").day,"2026-10-01");
});
