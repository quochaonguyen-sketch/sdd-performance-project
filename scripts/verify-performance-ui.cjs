// Server-rendered UI smoke check: no browser automation and no live credentials.
(async()=>{
 const fs=await import('node:fs'),path=await import('node:path'),{default:Module}=await import('node:module'),{default:ts}=await import('typescript');
 const assert=(await import('node:assert/strict')).default;
 const root=process.cwd(),resolve=Module._resolveFilename,originalLoad=Module._load;
 let currentQuery=new URLSearchParams();
 let detailFixture=null,detailHook=0;
 Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...args);};
 Module._load=function(name,...args){if(name==='server-only')return {};if(name==='next/navigation')return {usePathname:()=>'/performance',useSearchParams:()=>currentQuery,useRouter:()=>({push:()=>{throw Error('Unexpected navigation during SSR check');}})};const result=originalLoad.call(this,name,...args);if(name==='react'&&detailFixture)return {...result,useState:initial=>{const index=detailHook++;return result.useState(index===3?detailFixture:index===4?false:initial);}};return result;};
 for(const extension of ['.ts','.tsx'])Module._extensions[extension]=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);};
 Module._extensions['.css']=mod=>{mod.exports={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};};
 const load=Module.createRequire(__filename),React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {DriverPerformanceView}=load('../components/performance/driver-performance-view.tsx');
 const {parsePerformanceFilters}=load('../lib/performance/filters.ts');
 const {buildPerformanceAnalysis}=load('../lib/performance/analysis.ts');
 const base={delivery_assigned:10,delivery_delivered:8,pickup_assigned:6,pickup_picked:4};
 const sample={...base,report_date:'2026-10-26',driver_id:'TEST001',rider_id:'12345678-1234-4234-8234-123456789012',driver_name:'Rider test',rider_name:'Rider test',kv:'KV1',cot:'COT 1',delivery_district:'Test district',delivery_ward:'Test ward',pickup_district:'Test district',delivery_assigned_cot1:10,delivery_delivered_cot1:8,delivery_assigned_cot2:0,delivery_delivered_cot2:0,pickup_assigned_cot1:6,pickup_picked_cot1:4,pickup_assigned_cot2:0,pickup_picked_cot2:0};
 for(const period of ['day','range']){
  currentQuery=new URLSearchParams({period,date:'2026-10-26',...(period==='range'?{start:'2026-10-20',end:'2026-10-26'}:{})});
  const filters=parsePerformanceFilters(currentQuery);
  const result={filters,rows:[sample],summary:{...base,groups:1,active_riders:1},options:{districts:['Test district'],wards:['Test ward'],cots:['COT 1']},wardOnHold:[],analysis:buildPerformanceAnalysis({daily:[{...base,date:'2026-10-26',riders:1}],areas:[],riders:[base]},filters.start,filters.end)};
  const html=renderToStaticMarkup(React.createElement(DriverPerformanceView,{filters,result,error:null,loadedKey:period}));
  for(const label of ['Total Delivered','Total Picked','Total Assigned Pick','Delivery Success Rate','Pickup Success Rate','Xuất Excel','COT 1: 8/10','Convert Pick','Bộ lọc dữ liệu'])assert.ok(html.includes(label),`Missing ${label}`);
  assert.ok(html.includes('/riders/'+sample.rider_id+'/performance?origin=performance'));
  assert.ok(html.indexOf('Danh sách rider')<html.indexOf('Hiểu rõ hơn về sản lượng'));
  if(period==='range'){assert.ok(html.includes('Performance từ ngày'));assert.ok(html.includes('Performance đến ngày'));}
  console.log(period+': controls, metrics, COT badges, drilldown, export and analysis verified.');
 }
 const {buildRiderDaily,summarizeRiderDaily}=load('../lib/performance/rider-detail.ts');
 const daily=buildRiderDaily([sample],sample.cot),range={from:'2026-10-20',to:'2026-10-26'};
 detailFixture={rider:{...sample,full_name:sample.rider_name,rider_code:sample.driver_id},range,daily,summary:summarizeRiderDaily(daily)};
 const {RiderPerformanceView}=load('../components/riders/rider-performance-view.tsx');
 const detail=renderToStaticMarkup(React.createElement(RiderPerformanceView,{riderId:sample.rider_id,initialRange:range,fromPerformance:true}));
 for(const label of ['ID rider','TEST001','Rider test','Từ ngày','Đến ngày','Xem rider','Xem dữ liệu','Xuất Excel','COT 1: 8/10','Total Assigned Deli','Total Assigned Pick','Convert Pick','Total','7 ngày gần nhất','30 ngày gần nhất','90 ngày gần nhất','Cách tính &amp; đối soát COT'])assert.ok(detail.includes(label),`Detail missing ${label}`);
 assert.ok(detail.includes('value="2026-10-20"'));assert.ok(detail.includes('value="2026-10-26"'));
 assert.ok(detail.indexOf('Sản lượng theo ngày')<detail.indexOf('Diễn biến sản lượng'));
 console.log('detail: profile, ID/date controls, presets, metrics, COT, export and trend verified with fixture data.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
