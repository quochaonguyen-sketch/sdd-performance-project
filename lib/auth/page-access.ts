import type {MemberPermissions} from "./permissions";

export const PAGE_ACCESS_OPTIONS=[
 {key:"dashboard",label:"Dashboard",path:"/dashboard"},
 {key:"delivery_realtime",label:"Delivery Realtime",path:"/realtime-dashboard"},
 {key:"pickup_realtime",label:"Pickup Realtime",path:"/pickup-realtime"},
 {key:"linehaul",label:"Quản lý LH",path:"/linehaul"},
 {key:"pickup_backlog",label:"Pickup Backlog",path:"/lmhub-inventory"},
 {key:"delivery_backlog",label:"Delivery Backlog",path:"/inventory-delivery"},
 {key:"backlog_history",label:"Backlog History",path:"/backlog-history"},
 {key:"overnight",label:"Giữ hàng qua đêm",path:"/overnight-holds"},
 {key:"delivery_volume",label:"Delivery Volume",path:"/volume/delivery"},
 {key:"pickup_volume",label:"Pickup Volume",path:"/volume/pickup"},
 {key:"performance",label:"Rider Performance",path:"/performance"},
 {key:"onhold",label:"On-Hold Analytics",path:"/onhold"},
 {key:"riders",label:"Rider Directory",path:"/riders"},
 {key:"team",label:"Staffing & Scheduling",path:"/team"},
 {key:"pickup_management",label:"Pickup Management (Points / Coverage)",path:"/pickup-management"},
 {key:"return",label:"Return Orders",path:"/return-orders"},
 {key:"notes",label:"Notes",path:"/notes"},
 {key:"off_schedule",label:"Time Off",path:"/off-schedule"},
 {key:"tasks",label:"Tasks",path:"/tasks"},
 {key:"violations",label:"Violations",path:"/violations"},
 {key:"sheets",label:"Operations Sheets",path:"/route-sheet"},
 {key:"imports",label:"Data Import",path:"/imports"},
 {key:"sources",label:"Data Sources",path:"/data-sources"},
 {key:"zones",label:"Zones / Zone Builder",path:"/zones"},
 {key:"feedback",label:"Báo lỗi & góp ý",path:"/feedback"},
] as const;
export type PageAccessKey=typeof PAGE_ACCESS_OPTIONS[number]["key"];
export type PageAccess=Record<PageAccessKey,boolean>;
export type ConfigurableRole="member"|"leader";
export function defaultPageAccess(role:string):PageAccess{
 return Object.fromEntries(PAGE_ACCESS_OPTIONS.map(item=>[item.key,
  role==="admin"||role==="leader"||role==="viewer"||(role==="member"&&!["team","pickup_management"].includes(item.key))])) as PageAccess;
}
export function normalizePageAccess(role:string,value:unknown):PageAccess{
 const result=defaultPageAccess(role);
 if(role==="admin"||!value||typeof value!=="object")return result;
 for(const {key} of PAGE_ACCESS_OPTIONS)if(typeof (value as PageAccess)[key]==="boolean")result[key]=(value as PageAccess)[key];
 return result;
}
export function canViewPage(role:string,access:PageAccess|undefined,key:PageAccessKey){
 return role==="admin"||(access??defaultPageAccess(role))[key]===true;
}
export function canEditStaff(role:string,access?:PageAccess){
 return (role==="admin"||role==="leader")&&canViewPage(role,access,"team");
}
export function pageForPath(path:string):PageAccessKey|"admin"|null{
 const clean=path.split("?")[0].replace(/\/$/,"");
 if(["/role-permissions","/user-activity","/site-health"].some(p=>clean===p||clean.startsWith(p+"/")))return "admin";
 if(clean==="/zone-builder"||clean.startsWith("/zone-builder/"))return "zones";
 return PAGE_ACCESS_OPTIONS.find(item=>clean===item.path||clean.startsWith(item.path+"/"))?.key??null;
}
const API_PAGES:Array<[string,PageAccessKey[]]>=[
 ["team",["team"]],["pickup-points",["pickup_management"]],["pickup-replacements",["pickup_management"]],
 ["linehaul",["linehaul"]],["pickup-realtime",["pickup_realtime"]],["pickup-inventory",["pickup_backlog"]],
 ["lmhub-inventory",["pickup_backlog","delivery_backlog"]],["backlog-history",["backlog_history"]],
 ["overnight-holds",["overnight"]],["onhold",["onhold"]],["driver-performance",["performance"]],
 ["morning-delivery",["delivery_realtime"]],["return-orders",["return"]],
 ["riders",["riders","performance","pickup_management","off_schedule","tasks","violations","delivery_realtime","sheets"]],
 ["notes",["notes"]],["off-requests",["off_schedule","pickup_management","dashboard"]],
 ["attendance",["off_schedule","pickup_management","delivery_realtime"]],["tasks",["tasks"]],
 ["violations",["violations"]],["operations-sheet",["sheets"]],["data-sources",["sources"]],
 ["dashboard",["dashboard","delivery_volume","pickup_volume","delivery_backlog","return"]],
 ["feedback",["feedback"]],["ai/actions",["off_schedule"]],
];
export function pagesForApi(path:string,method="GET"):PageAccessKey[]|"admin"|null{
 // Token-authenticated ingestion, public forms, auth and telemetry retain their own guards.
 if(path==="/api/attendance/schedule/google-webhook")return null;
 if(path==="/api/admin"||path.startsWith("/api/admin/"))return "admin";
 if(!["GET","HEAD","OPTIONS"].includes(method)&&(/^\/api\/riders(?:\/|$)/.test(path)))return ["riders"];
 if(path==="/api/off-requests/pending")return null;
 return API_PAGES.find(([prefix])=>path===`/api/${prefix}`||path.startsWith(`/api/${prefix}/`))?.[1]??null;
}
export function viewPermissions(base:MemberPermissions,access:PageAccess):MemberPermissions{
 return {...base,
  manage_dashboard:access.dashboard||access.delivery_realtime||access.linehaul,
  manage_return:access.return,
  manage_volume:access.delivery_volume||access.pickup_volume,
  manage_performance:access.performance||access.onhold,
  manage_pickup:access.pickup_realtime||access.pickup_backlog||access.delivery_backlog||access.backlog_history||access.pickup_management||access.pickup_volume||access.sheets,
 };
}
