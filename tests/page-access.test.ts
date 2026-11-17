import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {PAGE_ACCESS_OPTIONS,defaultPageAccess,normalizePageAccess,canViewPage,canEditStaff,canEditRiderSchedule,pageForPath,pagesForApi,viewPermissions} from "../lib/auth/page-access.ts";
import {normalizePermissions} from "../lib/auth/permissions.ts";

test("member defaults allow operational pages except restricted workspaces",()=>{
 const access=defaultPageAccess("member");
 assert.deepEqual(PAGE_ACCESS_OPTIONS.filter(item=>!access[item.key]).map(item=>item.key),["lost","team","pickup_management"]);
 assert.equal(canViewPage("viewer",undefined,"lost"),false);
 assert.equal(canViewPage("leader",undefined,"lost"),true);
 for(const path of ["/pickup-realtime","/lmhub-inventory","/inventory-delivery","/volume/pickup","/linehaul","/zone-builder"]){
  const key=pageForPath(path);assert.ok(key&&key!=="admin");assert.equal(canViewPage("member",access,key),true);
 }
 assert.equal(canEditStaff("member",access),false);
});
test("leaders can edit staff by default; role revocation blocks both viewing and editing",()=>{
 assert.equal(canEditStaff("leader",defaultPageAccess("leader")),true);
 const revoked=normalizePageAccess("leader",{team:false,pickup_management:false});
 assert.equal(canEditStaff("leader",revoked),false);
 assert.equal(canViewPage("leader",revoked,"pickup_management"),false);
 assert.equal(canEditStaff("admin",revoked),true);
 const member=normalizePageAccess("member",{team:true});assert.equal(member.team,true);assert.equal(canEditStaff("member",member),false);
});
test("nested pages, query strings, APIs and prefix lookalikes map correctly",()=>{
 assert.deepEqual(pagesForApi("/api/zones/plan"),["zones"]);
 assert.equal(pagesForApi("/api/zones-other/plan"),null);
 assert.equal(pageForPath("/pickup-management?view=replacement"),"pickup_management");
 assert.equal(pageForPath("/pickup-management/foo"),"pickup_management");assert.equal(pageForPath("/pickup-management-evil"),null);
 assert.equal(pageForPath("/role-permissions"),"admin");
 assert.deepEqual(pagesForApi("/api/team/planning"),["team"]);
 assert.deepEqual(pagesForApi("/api/pickup-points/ado"),["pickup_management"]);
 assert.deepEqual(pagesForApi("/api/pickup-replacements","POST"),["pickup_management"]);
 assert.deepEqual(pagesForApi("/api/riders/123/avatar","POST"),["riders"]);
 assert.equal(pagesForApi("/api/admin/role-permissions","PATCH"),"admin");
 for(const path of ["/api/import/riders","/api/public/off-requests","/api/auth/login","/api/attendance/schedule/google-webhook"])assert.equal(pagesForApi(path),null);
});
test("rider schedules inherit Staffing read access without giving a team-only member write access", () => {
 assert.equal(pageForPath("/team/rider-schedule/rider-id"), "team");
 assert.equal(pageForPath("/team/off-review"), "team");
 assert.deepEqual(pagesForApi("/api/attendance/schedule/off-review", "PATCH"), ["team"]);
 assert.deepEqual(pagesForApi("/api/attendance/riders/1"), ["pickup_management", "delivery_realtime", "team"]);
 assert.deepEqual(pagesForApi("/api/attendance/schedule/import", "POST"), ["pickup_management", "delivery_realtime"]);
 const member = normalizePageAccess("member", { team: true, pickup_management: false, delivery_realtime: false });
 assert.equal(canEditRiderSchedule("member", member), false);
 assert.equal(canEditRiderSchedule("member", defaultPageAccess("member")), true);
 assert.equal(canEditRiderSchedule("leader", normalizePageAccess("leader", { team: true, pickup_management: false, delivery_realtime: false })), true);
});
test("the rider schedule has its own Workforce navigation item", () => {
 const shell = readFileSync(new URL("../components/layout/app-shell.tsx", import.meta.url), "utf8");
 assert.match(shell, /\{ href: "\/team\/rider-schedule", label: "Lịch rider"/);
 assert.match(shell, /const teamPaths = \[[^\]]*"\/team\/rider-schedule"/);
 assert.match(shell, /const morePaths = \[[^\]]*"\/team\/rider-schedule"/);
});
test("role page visibility replaces legacy read flags without granting rider edits",()=>{
 const access=defaultPageAccess("member"),permissions=viewPermissions(normalizePermissions({},"member"),access);
 assert.equal(permissions.manage_dashboard,true);assert.equal(permissions.manage_pickup,true);assert.equal(permissions.manage_return,true);
 assert.equal(permissions.manage_riders,false);
 const none=Object.fromEntries(PAGE_ACCESS_OPTIONS.map(item=>[item.key,false]));
 const revoked=viewPermissions(permissions,normalizePageAccess("member",none));
 assert.equal(revoked.manage_dashboard,false);assert.equal(revoked.manage_pickup,false);assert.equal(revoked.manage_volume,false);
 assert.equal(normalizePageAccess("leader",{team:"yes"}).team,true);
});
