import test from "node:test";
import assert from "node:assert/strict";
import {PAGE_ACCESS_OPTIONS,defaultPageAccess,normalizePageAccess,canViewPage,canEditStaff,pageForPath,pagesForApi,viewPermissions} from "../lib/auth/page-access.ts";
import {normalizePermissions} from "../lib/auth/permissions.ts";

test("member defaults allow operational pages except staff and pickup management",()=>{
 const access=defaultPageAccess("member");
 assert.deepEqual(PAGE_ACCESS_OPTIONS.filter(item=>!access[item.key]).map(item=>item.key),["team","pickup_management"]);
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
test("role page visibility replaces legacy read flags without granting rider edits",()=>{
 const access=defaultPageAccess("member"),permissions=viewPermissions(normalizePermissions({},"member"),access);
 assert.equal(permissions.manage_dashboard,true);assert.equal(permissions.manage_pickup,true);assert.equal(permissions.manage_return,true);
 assert.equal(permissions.manage_riders,false);
 const none=Object.fromEntries(PAGE_ACCESS_OPTIONS.map(item=>[item.key,false]));
 const revoked=viewPermissions(permissions,normalizePageAccess("member",none));
 assert.equal(revoked.manage_dashboard,false);assert.equal(revoked.manage_pickup,false);assert.equal(revoked.manage_volume,false);
 assert.equal(normalizePageAccess("leader",{team:"yes"}).team,true);
});
