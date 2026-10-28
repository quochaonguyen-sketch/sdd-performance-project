// SSR fixture check for the morning rider board; no live orders or authentication.
(async()=>{
 const fs=await import('node:fs'),path=await import('node:path'),{default:Module}=await import('node:module'),{default:ts}=await import('typescript'),assert=await import('node:assert/strict');
 const root=process.cwd(),resolve=Module._resolveFilename,originalLoad=Module._load;
 let hook=0,fixture=null,selected=null;
 Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...args);};
 Module._load=function(name,...args){
  if(name==='@/components/layout/app-loading-store')return {useReportInitialDataLoading:()=>{}};
  if(name==='@/components/layout/filter-memory')return {useRememberedState:(_key,initial)=>Module._load('react',module).useState(initial)};
  const result=originalLoad.call(this,name,...args);
  if(name==='react')return {...result,useState:initial=>{const index=hook++;return result.useState(index===1?fixture:index===2?false:index===11?selected:initial);}};
  return result;
 };
 for(const extension of ['.ts','.tsx'])Module._extensions[extension]=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);};
 Module._extensions['.css']=mod=>{mod.exports={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};};
 const load=Module.createRequire(__filename),React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {OvernightHoldsView}=load('../components/overnight-holds/overnight-holds-view.tsx'),{paginateOvernightRiders}=load('../lib/overnight-holds/riders.ts');
 const orders=Array.from({length:120},(_,i)=>({id:String(i),rider_code:'TEST-A',rider_name:'Rider test',order_code:`TEST-ORDER-${i}`,area:'Khu vực 1',cutoff_status:5,current_status:'Onhold',note:'',last_synced_at:'2026-10-27T00:00:00Z'}));
 orders.push(...Array.from({length:12},(_,i)=>({...orders[0],id:`B-${i}`,order_code:`TEST-B-${i}`,rider_code:'TEST-B',rider_name:'Rider B',area:'Khu vực 2',current_status:i<4?'Returned':'Delivering'})));
 orders.push(...Array.from({length:8},(_,i)=>({...orders[0],id:`C-${i}`,order_code:`TEST-C-${i}`,rider_code:'TEST-C',rider_name:'Rider C',area:'Khu vực 3',current_status:i<6?'Returned':'Onhold'})));
 fixture={...paginateOvernightRiders(orders,[{rider_code:'TEST-A',note:'Liên hệ trước 8h',updated_by:'Dispatcher'}],0,20),total:140,pageSize:20,snapshot:null,snapshots:[],summary:{total:140,delivering:12,onhold:128,resolved:10,hasNotes:0,riderCount:3}};
 for(const code of [null,'TEST-A']){
  hook=0;selected=code;
  const html=renderToStaticMarkup(React.createElement(OvernightHoldsView,{initialDay:'2026-10-26'}));
  for(const text of ['Rider test','Liên hệ trước 8h','120','còn giữ','Dispatcher'])assert.ok(html.includes(text),`Missing ${text}`);
  assert.equal(html.includes('TEST-ORDER-119'),Boolean(code));
  assert.ok(html.includes(`aria-expanded="${Boolean(code)}"`));
  if(process.argv.includes('--preview')){
   const css=fs.readFileSync(path.join(root,'components/overnight-holds/overnight-holds.module.css'),'utf8');
   const base=':root{--color-paper:#fff;--color-paper-2:#f4f7fb;--color-ink:#1e344d;--color-ink-2:#60738b;--color-rule:#dce4ed;--color-accent:#315e91;--color-error:#b42336}body{margin:0;padding:24px;background:#f5f7fa;font-family:Segoe UI,Arial,sans-serif}button,input,select,textarea{font:inherit}button{cursor:pointer}button:disabled{cursor:not-allowed}button{background:transparent}svg{vertical-align:middle}';
   fs.writeFileSync(path.join(root,`.next/overnight-preview${code?'-expanded':''}.html`),`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${base}${css}</style></head><body>${html}</body></html>`);
  }
 }
 for(const [sync,expected] of [
  [{},'Chưa đồng bộ SPX'],
  [{status_sync_requested_at:'2026-10-28T02:00:00Z'},'Đang chờ worker'],
  [{status_sync_token:'lease'},'Đang lấy trạng thái từ SPX'],
  [{status_synced_at:'2026-10-28T02:00:00Z'},'Đồng bộ SPX:'],
  [{status_sync_error:'SPX unavailable'},'SPX unavailable'],
 ]){
  fixture.snapshot={cutoff_date:'2026-10-26',captured_at:'2026-10-26T16:04:00Z',...sync};
  hook=0;selected='TEST-A';
  const html=renderToStaticMarkup(React.createElement(OvernightHoldsView,{initialDay:'2026-10-26'}));
  assert.ok(html.includes(expected),`Missing sync state: ${expected}`);
  assert.ok(html.includes(sync.status_synced_at?'Sync SPX:':'Chưa đồng bộ SPX'));
 }
 console.log('Rider board SSR: grouped counts, saved notes, accessible expansion and all 120 order details passed.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
