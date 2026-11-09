const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const originalResolve=Module._resolveFilename,originalLoad=Module._load;
let context=null,dbError=false,reads=0,hook=0;
const now=Date.now(),day=new Date(now+7*3600000).toISOString().slice(0,10),at=new Date(now).toISOString();
const row={shipment_id:'WH_DEMO_001',tracking_number:'WH_DEMO_001',raw_status:'Delivered',area:'KV4',district:'Quận 1',ward:'Phường Bến Nghé',zone:'',driver_id:'1',driver_name:'Rider minh họa',attempt:0,onhold_reason:'',created_at:new Date(now-4*3600000).toISOString(),received_at:at,delivering_at:at,delivered_at:at,onhold_at:null,soc_pending_at:new Date(now-3*3600000).toISOString()};
const orders=[row,{...row,shipment_id:'WH_DEMO_002',raw_status:'LMhub_received',driver_name:'',attempt:0,delivered_at:null,delivering_at:null},
 {...row,shipment_id:'WH_DEMO_003',raw_status:'SOC_pendingReceive',driver_name:'',delivered_at:null,received_at:null},
 {...row,shipment_id:'WH_DEMO_004',raw_status:'Onhold',area:'KV5',district:'Gò Vấp',attempt:1,onhold_at:at,created_at:new Date(now-5*3600000).toISOString(),delivered_at:null}];
const fixture={day,snapshotAt:at,orders,canRefresh:true};
const db={from:()=>{reads++;return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:dbError?null:{snapshot_at:at,orders},error:dbError?{}:null})};},rpc:async()=>({data:{jobId:'queued',deduplicated:true}})};
Module._resolveFilename=function(name,parent,...args){return originalResolve.call(this,name.startsWith('@/')?path.join(process.cwd(),name.slice(2)):name,parent,...args);};
Module._extensions['.ts']=Module._extensions['.tsx']=function(module,file){module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);};
Module._extensions['.css']=module=>{module.exports={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};};
const React=require('react');
Module._load=function(name,parent,...args){
 if(name==='@/lib/auth/current-user')return {getCurrentUserContext:async()=>context};
 if(name==='@/lib/supabase/admin')return {createAdminClient:()=>db};
 if(name==='@/components/layout/app-loading-store')return {useReportInitialDataLoading:()=>{}};
 if(name==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
 if(name==='react'&&parent?.filename.endsWith('wh-dashboard.tsx'))return {...React,useState:()=>[[fixture,'','',false,false,'all','','all','status',1,now][hook++],()=>{}],useRef:()=>({current:null}),useCallback:fn=>fn,useEffect:()=>{}};
 return originalLoad.call(this,name,parent,...args);
};
(async()=>{
 const {counts,sla}=require('../lib/wh/model.ts');
 assert.equal(sla(row,'4h').state,'On time');assert.equal(sla({...row,created_at:new Date(now-4*3600000-1000).toISOString()},'4h').state,'Late');
 assert.equal(sla(row,'sdd').state,'On time');assert.equal(sla({...row,soc_pending_at:new Date(now-3*3600000-1000).toISOString()},'sdd').state,'Late');
 assert.equal(sla(row,'wh').state,'On time');assert.equal(sla({...row,soc_pending_at:new Date(now-3*3600000+31000).toISOString()},'wh').state,'Late');
 assert.equal(sla({...row,attempt:1,onhold_at:at,delivered_at:null},'4h').state,'Pending');
 assert.equal(sla({...row,attempt:2},'4h').state,'On time');assert.equal(sla({...row,attempt:2,created_at:new Date(now-5*3600000).toISOString()},'4h').state,'Late');
 const c=counts(orders,day);assert.equal(c.total,4);assert.equal(c.ready,1);assert.equal(c.unassigned,1);assert.equal(c.late,0);assert.equal(c.ontime,1);assert.equal(c.onhold,1);assert.equal(c.riders,1);
 const {GET,POST}=require('../app/api/wh-dashboard/route.ts');
 assert.equal((await GET()).status,401);assert.equal((await POST()).status,401);assert.equal(reads,0);
 context={user:{id:'user'},profile:{role:'viewer',page_access:{wh_tracking:false},permissions:{}}};
 assert.equal((await GET()).status,403);assert.equal((await POST()).status,403);assert.equal(reads,0);
 context.profile.page_access.wh_tracking=true;assert.equal((await GET()).status,200);assert.equal((await POST()).status,403);
 context.profile.role='leader';context.profile.permissions.manage_performance=true;assert.equal((await POST()).status,200);
 dbError=true;assert.equal((await GET()).status,503);dbError=false;
 const response=await GET();assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal((await response.json()).orders.length,4);
 const {renderToStaticMarkup}=require('react-dom/server'),{WhDashboard}=require('../components/wh/wh-dashboard.tsx');
 const html=renderToStaticMarkup(React.createElement(WhDashboard));
 for(const text of ['iPhone Report Dashboard','WH Ready','Orders by area','WH_DEMO_001','SOC pending receive','Late','On time','Chờ xuất giao'])assert.ok(html.includes(text),text);
 assert.ok(html.includes('role="')===false||!html.includes('role="alert"'));
 const originalOrders=fixture.orders;
 fixture.orders=[{...row,raw_status:'Delivering',created_at:new Date(now-2*3600000).toISOString(),delivered_at:null,onhold_at:null}];hook=0;
 const activeHtml=renderToStaticMarkup(React.createElement(WhDashboard));
 assert.ok(activeHtml.replace(/<[^>]*>/g,'').includes('Còn 2h 00p'),'Delivering keeps the live 4H countdown in the compact list');
 assert.ok(activeHtml.includes('Mốc thời gian')&&activeHtml.includes('Lý do On-Hold'),'Order disclosure retains the original detail fields');
 fixture.orders=originalOrders;hook=0;
 const previewPath=process.env.WH_PREVIEW_PATH;
 if(previewPath){const css=fs.readFileSync('components/wh/wh.module.css','utf8').replace(/\.([a-zA-Z_][\w-]*)/g,'.$1');fs.writeFileSync(previewPath,`<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WH fixture preview</title><style>:root{--color-ink:#1e344d;--color-ink-2:#52677d;--color-paper:#fff;--color-paper-2:#f5f8fb;--color-rule:#dce5ed;--color-accent:#315e91}*{box-sizing:border-box}body{font:14px Arial;margin:24px;background:#f5f7fa}h1,h2,p{margin-top:0}a{color:inherit}${css}</style><p>DỮ LIỆU MẪU · kiểm tra giao diện WH</p>${html}</html>`);}
 console.log('WH: SLA boundaries, Sheet counts, auth/permissions, queue API and actual component rendering passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
