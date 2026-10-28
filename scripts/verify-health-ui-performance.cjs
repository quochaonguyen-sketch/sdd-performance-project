const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const resolve=Module._resolveFilename,originalLoad=Module._load,root=process.cwd();let hook=0,mode='realtime',pendingRealtime=true,pendingProfiles=true,opened=false,lazyRenders=0;
const stamp='2026-10-28T07:00:00Z';
const rows=[{id:'1',driver_id:'123',driver_name:'Test Rider',total_assigned:100,delivered:45,delivering:55,failed:0,zone_id:'Z1',first_delivery_at:stamp,idle_delivery_seconds:60,snapshot_id:'test',snapshot_at:stamp}];
const profiles=[{rider_code:'123',full_name:'Test Rider',kv:'KV1',delivery_district:'Quận 1',delivery_ward:'Phường Tân Định',cot:'COT1'}];
Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...args)};
Module._load=function(name,...args){
 if(name==='@/components/layout/app-loading-store')return {useReportInitialDataLoading:()=>{}};
 if(name==='@/hooks/use-supabase-realtime')return {useSupabaseRealtime:()=>{}};
 if(name==='@/components/layout/filter-memory')return {useRememberedState:(_key,initial)=>Module._load('react',module).useState(initial)};
 if(name==='next/dynamic')return {__esModule:true,default:()=>props=>{lazyRenders++;assert.equal(props.initialOpen,true);return require('react').createElement('div',{'data-chat-loaded':true})}};
 const value=originalLoad.call(this,name,...args);
 if(name==='react')return {...value,useState:initial=>{const index=hook++;let state=initial;if(mode==='realtime'){if(index===0)state=rows;if(index===1)state=profiles;if(index===2)state=stamp;if(index===13)state=pendingRealtime;if(index===14)state=pendingProfiles;}if(mode==='launcher'&&index===0)state=opened;return value.useState(state)}};
 return value;
};
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
Module._extensions['.css']=mod=>mod.exports={};
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {RealtimeDashboardView}=require('../components/realtime-dashboard/realtime-dashboard-view.tsx');
function realtime(){hook=0;return renderToStaticMarkup(React.createElement(RealtimeDashboardView))}
const loading=realtime();assert.equal((loading.match(/class="rt-area-card/g)||[]).length,5);assert.ok(loading.includes('Đang tải 5 khu vực'));
pendingRealtime=false;const awaitingProfiles=realtime();assert.ok(awaitingProfiles.includes('Đang tải 5 khu vực'),'Must keep skeleton until rider profiles are ready');
pendingProfiles=false;const ready=realtime();assert.equal((ready.match(/class="rt-area-card/g)||[]).length,5);assert.ok(!ready.includes('Đang tải 5 khu vực'));
for(const kv of ['KV1','KV2','KV3','KV4','KV5']){assert.ok(loading.includes(`data-area="${kv}"`));assert.ok(ready.includes(`data-area="${kv}"`))}
mode='launcher';hook=0;const {AiLauncher}=require('../components/ai/ai-launcher.tsx');const initial=renderToStaticMarkup(React.createElement(AiLauncher));assert.equal(lazyRenders,0);assert.ok(initial.includes('Mở Rider Ops AI')&&initial.includes('size-10'));
opened=true;hook=0;assert.ok(renderToStaticMarkup(React.createElement(AiLauncher)).includes('data-chat-loaded'));assert.equal(lazyRenders,1);
mode='chat';hook=0;const {OllamaChatbox}=require('../components/ai/ollama-chatbox.tsx');const chat=renderToStaticMarkup(React.createElement(OllamaChatbox,{initialOpen:true}));assert.ok(chat.includes('id="ollama-chat-panel"')&&chat.includes('role="dialog"'));
console.log('Performance UI: stable five-area skeleton, profile/realtime readiness, deferred AI and first-click open passed.');
