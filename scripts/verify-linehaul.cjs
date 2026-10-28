// Exercise the actual route and render the page with non-sensitive fixture data.
(async()=>{
 const fs=await import('node:fs'),path=await import('node:path'),{default:Module}=await import('node:module'),{default:ts}=await import('typescript'),assert=await import('node:assert/strict');
 const resolve=Module._resolveFilename,originalLoad=Module._load;let context=null,reading=false,hook=0,view='active',selected=null;
 let refHook=0,modalSetup=null,modalShows=0,modalCloses=0;
 const modal={open:false,showModal(){this.open=true;modalShows++;},close(){this.open=false;modalCloses++;}};
 const now=Date.now(),stamp=new Date(now).toISOString(),day=new Date(now+7*3600000).toISOString().slice(0,10);
 const trip={trip_id:'123',lt_code:'LT-DEMO-001',trip_day:day,vehicle:'VAN',plate_number:'XE MINH HỌA',driver_name:'Tài xế minh họa',origin:'Kho xuất phát',destination:'52-HCM SDD-01 Hub',direction:'inbound',phase:'en_route',hub_sequence:2,hub_eta:new Date(now+20*60000).toISOString(),hub_sta:stamp,hub_ata:null,hub_atd:null,orders:807,bags:10,loose:237,load_total:247,pack_description:'10Bao 90x70,237NA',pack_unknown:'',expected_unload:247,unloaded_units:0,lat:10,lng:106,hub_lat:10,hub_lng:106,gps_at:stamp,location_checked_at:stamp,location_error:null,next_station:'52-HCM SDD-01 Hub'};
 trip.origin_atd=stamp;
 const fixture={day,snapshotAt:stamp,trips:[trip],canRefresh:true};
 const db={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{snapshot_at:stamp,trips:[trip]}})}),rpc:async()=>({data:{jobId:'queued-test'}})};
 Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(process.cwd(),name.slice(2)):name,parent,...args);};
 Module._load=function(name,...args){
  if(name==='server-only')return {};
  if(name==='@/lib/auth/current-user')return {getCurrentUserContext:async()=>context};
  if(name==='@/lib/supabase/admin')return {createAdminClient:()=>db};
  if(name==='@/components/layout/app-loading-store')return {useReportInitialDataLoading:()=>{}};
  if(name==='next/dynamic')return {__esModule:true,default:()=>()=>null};
  const result=originalLoad.call(this,name,...args);
  if(name==='react'&&reading)return {...result,useState:initial=>{const index=hook++;if(index===0)refHook=0;return result.useState(index===0?fixture:index===1?false:index===6?selected:index===9?now:index===10?view:initial);},useRef:initial=>{const ref=result.useRef(initial);if(refHook++===2)ref.current=modal;return ref;},useEffect:(effect,deps)=>{if(effect.toString().includes('showModal'))modalSetup=effect;return result.useEffect(effect,deps);}};
  return result;
 };
 for(const extension of ['.ts','.tsx'])Module._extensions[extension]=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);};
 Module._extensions['.css']=mod=>{mod.exports={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};};
 const load=Module.createRequire(__filename),{GET,POST}=load('../app/api/linehaul/route.ts');
 assert.equal((await GET()).status,401);assert.equal((await POST()).status,401);
 context={profile:{role:'member',permissions:{manage_dashboard:false}},user:{id:'test'}};assert.equal((await GET()).status,403);
 context.profile.permissions.manage_dashboard=true;assert.equal((await GET()).status,200);assert.equal((await POST()).status,403);
 context.profile.role='admin';assert.equal((await POST()).status,200);assert.equal((await (await GET()).json()).trips.length,1);
 reading=true;hook=0;
 const {LinehaulView}=load('../components/linehaul/linehaul-view.tsx'),React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const listHtml=renderToStaticMarkup(React.createElement(LinehaulView));
 assert.ok(!listHtml.includes("<dialog"),"Details must stay closed until a trip is clicked");
 assert.ok(!listHtml.includes("<aside"),"Full-width list must not keep the detail sidebar");
 assert.ok(listHtml.includes("GPS gần nhất"));assert.ok(listHtml.includes(`dateTime="${stamp}"`));
 assert.ok(listHtml.includes('aria-haspopup="dialog"'));
 for(const label of ['Hàng về &amp; tiến độ xả tải','Đang lên hàng','Phân bổ đơn theo giờ','Chi tiết tải theo chuyến'])assert.ok(listHtml.includes(label),`Missing summary ${label}`);
 const oldGps=new Date(now-30*60000).toISOString();trip.gps_at=oldGps;hook=0;
 const staleGpsHtml=renderToStaticMarkup(React.createElement(LinehaulView));
 assert.ok(staleGpsHtml.includes(`dateTime="${oldGps}"`));assert.ok(staleGpsHtml.includes('GPS cũ'));
 trip.gps_at='invalid';hook=0;
 const invalidGpsHtml=renderToStaticMarkup(React.createElement(LinehaulView));assert.ok(invalidGpsHtml.includes('Chưa có thời gian GPS'));assert.ok(!invalidGpsHtml.includes('Invalid Date'));
 trip.gps_at=stamp;
 hook=0;selected="123";
 const html=renderToStaticMarkup(React.createElement(LinehaulView));
 assert.ok(html.includes("<dialog"));assert.ok(html.includes('aria-modal="true"'));assert.ok(html.includes("Đóng chi tiết chuyến"));
 // Replay the real dialog effect as React Strict Mode does on first mount.
 assert.equal(typeof modalSetup,'function');
 const previousDocument=global.document;global.document={body:{style:{overflow:'scroll'}}};
 try{
  const cleanup=modalSetup();assert.equal(modal.open,true);cleanup();
  const cleanupAgain=modalSetup();assert.equal(modal.open,true);
  assert.equal(modalCloses,0,'Strict Mode cleanup must not emit a native close event');
  assert.equal(modalShows,1,'An already-open dialog must not reopen during effect replay');
  cleanupAgain();assert.equal(global.document.body.style.overflow,'scroll');
 }finally{if(previousDocument===undefined)delete global.document;else global.document=previousDocument;}
 for(const text of ['LT-DEMO-001','807','10 bao','237 xá','XE MINH HỌA','Tài xế minh họa','Sản lượng chuyến','Mốc vận hành thực tế'])assert.ok(html.includes(text),`Missing ${text}`);
 assert.ok(!html.includes('ETA'));
  fixture.trips.push({...trip,trip_id:'456',lt_code:'LT-DONE',source:'history',phase:'unloaded',hub_ata:stamp,hub_unloaded_at:stamp,unloaded_units:167,lat:null,lng:null,gps_at:null});
  hook=0;view='history';selected='456';const historyHtml=renderToStaticMarkup(React.createElement(LinehaulView));
  for(const text of ['LT-DONE','Đã hoàn tất xả tải','167 kiện TO','Xả xong:'])assert.ok(historyHtml.includes(text),`History missing ${text}`);
  assert.ok(!historyHtml.includes('SPX chưa có GPS xe cho chuyến này.'));
  fixture.trips[1]={...fixture.trips[1],source:'dashboard',phase:'at_hub',hub_unloaded_at:null,unloaded_units:null,expected_unload:null,load_total:35,bags:10,loose:25,origin_atd:stamp,pack_description:'Bao 90x70 10,Other 25'};
  hook=0;const dashboardHtml=renderToStaticMarkup(React.createElement(LinehaulView));
  for(const text of ['Đã đến hub','Tổng 35 kiện TO','10 bao','25 xá','Rời kho xuất phát'])assert.ok(dashboardHtml.includes(text),`Dashboard missing ${text}`);
  assert.ok(!dashboardHtml.includes('Đã hoàn tất xả tải'));
  for(const text of ['ETA','API không cung cấp','Chưa có mốc giờ xả','Hoàn tất xả tải','Rời hub','GPS gần nhất'])assert.ok(!dashboardHtml.includes(text),`Unavailable field shown: ${text}`);
  view='active';selected='123';fixture.trips=[{...trip,vehicle:'',plate_number:'',driver_name:'',origin:'',destination:'',origin_atd:null,hub_eta:stamp,hub_sta:null,orders:null,bags:0,loose:null,load_total:null,expected_unload:null,unloaded_units:null,pack_description:'',lat:null,lng:null,gps_at:null}];
  hook=0;const sparseHtml=renderToStaticMarkup(React.createElement(LinehaulView));
  for(const text of ['ETA','Mốc thực tế','Mốc vận hành thực tế','Giờ đến kế hoạch','Chưa có tên','Chưa có biển','Vị trí xe','Chi tiết đóng gói'])assert.ok(!sparseHtml.includes(text),`Empty field shown: ${text}`);
  assert.ok(sparseHtml.includes('Chưa có thời gian GPS'));
  assert.ok(sparseHtml.includes('0 bao'),'Real zero must remain visible');
  fixture.trips[0].bags=null;hook=0;
  const emptyCargoHtml=renderToStaticMarkup(React.createElement(LinehaulView));
  assert.ok(!emptyCargoHtml.includes('Tải trên xe'));
  assert.ok(!emptyCargoHtml.includes('Sản lượng chuyến'));
 console.log('LH API permissions, active/history/dashboard UI, no ETA, absent fields hidden and real zero cargo passed.');
 if(process.argv.includes('--preview')){
  const css=fs.readFileSync('components/linehaul/linehaul.module.css','utf8');
  fs.mkdirSync('.next',{recursive:true});
  fs.writeFileSync('.next/linehaul-redesign.html',`<html lang="vi"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LH — dữ liệu mẫu</title><style>:root{--color-ink:#1e344d;--color-ink-2:#52677d;--color-paper:#fff;--color-paper-2:#f5f8fb;--color-rule:#dce5ed;--color-accent:#315e91}*{box-sizing:border-box}body{margin:24px;background:#f5f7fa;font:14px Arial}button,input,select{font:inherit}button{border:0;background:none}h1,h2,p{margin-top:0}${css}</style><p>DỮ LIỆU MẪU — kiểm tra giao diện Quản lý LH</p>${listHtml}${html.match(/<dialog[\s\S]*?<\/dialog>/)?.[0]??""}<script>const detail=document.querySelector("dialog");document.querySelectorAll(".selectTrip").forEach(button=>button.onclick=()=>detail.showModal());detail.querySelector("button").onclick=()=>detail.close();</script></html>`);
  require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync('.next/linehaul-redesign.html'));}).listen(3003,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:3003'));
 }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
