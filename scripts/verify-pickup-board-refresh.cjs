// Exercise the real component hooks with controlled requests/timers, without a live login.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const root=process.cwd(),resolve=Module._resolveFilename,originalLoad=Module._load;
const realtime={};
let cursor=0,pending=[],states=[],effects=[],rendered;
const timeouts=new Map(),intervals=new Map();let timerId=0;
const events=new EventTarget();global.document=Object.assign(events,{visibilityState:'visible'});
global.setTimeout=(fn,ms)=>{const id=++timerId;timeouts.set(id,{fn,ms});return id};
global.clearTimeout=id=>timeouts.delete(id);
global.setInterval=(fn,ms)=>{const id=++timerId;intervals.set(id,{fn,ms});return id};
global.clearInterval=id=>intervals.delete(id);
const hooks={
 useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},
 useRef(initial){return hooks.useState(()=>({current:initial}))[0]},
 useMemo(fn){cursor++;return fn()},useCallback(fn){cursor++;return fn},
 useEffect(fn,deps){const i=cursor++,previous=effects[i];if(!previous||deps.some((v,j)=>!Object.is(v,previous.deps[j])))pending.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:fn()}})}
};
Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...args)};
Module._load=function(name,...args){
 if(name==='react')return {...originalLoad.call(this,name,...args),...hooks};
 if(name==='@/hooks/use-supabase-realtime')return {useSupabaseRealtime:options=>{realtime[options.table]=options.onChange}};
 if(name==='@/components/layout/app-loading-store')return {useReportInitialDataLoading:()=>{}};
 if(name==='@/components/layout/filter-memory')return {useRememberedState:(_key,initial)=>hooks.useState(initial)};
 return originalLoad.call(this,name,...args);
};
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
Module._extensions['.css']=mod=>mod.exports={};
const {PickupInventoryView}=require('../components/lmhub-inventory/pickup-inventory-view.tsx');
let count=7,snapshot='2026-10-28T01:00:00Z',fail=false,boardCalls=0,hold=null;
const fixture=()=>({success:true,snapshotAt:snapshot,rows:[{area:'KV1',district:'Quận 1',ward:'Phường Tân Định',cot:'COT1',orders:count}],riders:[{area:'KV1',ward:'Ward',zones:['ZONE-A'],rider_name:'Test rider',rider_code:'1',rider_cot:'COT1',cot1:count,cot2:0,total:count}]});
global.fetch=async(url,options)=>{
 if(String(url).startsWith('/api/lmhub-inventory/refresh'))return {ok:true,json:async()=>({success:true,queued:options?.method==='POST',pending:0,running:0,lastStatus:'DONE'})};
 assert.ok(String(url).includes('view=geography-dashboard'),'Boards must share one request');boardCalls++;
 if(hold)return hold;
 if(fail)throw Error('test network failure');
 const payload=fixture();return {ok:true,json:async()=>payload};
};
function render(){cursor=0;pending=[];rendered=PickupInventoryView({canQueue:true});for(const effect of pending)effect();return rendered}
function all(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(all);return [node,...all(node.props?.children)]}
function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children)}
function button(label){const found=all(rendered).find(n=>n.props?.onClick&&text(n).includes(label));assert.ok(found,`Missing button ${label}`);return found}
function rider(){return all(rendered).find(n=>n.type?.name==='PickupRiderInventory')?.props}
async function flush(){for(let i=0;i<8;i++)await new Promise(setImmediate);render();render()}
async function fireTimeouts(){for(const [id,t] of [...timeouts]){timeouts.delete(id);t.fn()}await flush()}
async function poll(ms){const t=[...intervals.values()].find(t=>t.ms===ms);assert.ok(t,`Missing ${ms}ms poll`);t.fn();await flush()}
(async()=>{
 render();await fireTimeouts();
 const board=all(rendered).find(n=>n.type?.name==='DeliveryInventoryBoard');assert.ok(board);assert.equal(board.props.kind,'Pickup');
 const district=board.props.districts[0],ward=district.wards[0];assert.equal(district.district,'Quận 1');assert.equal(ward.ward,'Phường Tân Định');assert.equal(district.totals.total,7);
 board.props.onSelect({area:ward.area,district:ward.district,ward:ward.ward});render();
 const modal=all(rendered).find(n=>n.type?.name==='PickupOrderDialog');assert.ok(modal);assert.equal(modal.props.scope.district,'Quận 1');assert.equal(modal.props.scope.ward,'Phường Tân Định');assert.equal(modal.props.scope.zone,undefined);modal.props.onClose();render();
 button('Tồn theo rider').props.onClick();render();
 assert.equal(rider().rows[0].total,7);assert.equal(rider().loading,false);
 count=11;snapshot='2026-10-28T01:05:00Z';await poll(15000);
 assert.equal(rider().rows[0].total,11,'External job must refresh riders without realtime');
 const shared=states.find(s=>s?.rows&&s?.riders);assert.equal(shared.rows[0].orders,11);assert.equal(shared.snapshotAt,snapshot);
 count=13;button('Làm mới bảng').props.onClick();await flush();assert.equal(rider().rows[0].total,13,'Manual refresh must update riders even with unchanged timestamp');
 let release;const old=fixture();hold=new Promise(r=>release=r);button('Làm mới bảng').props.onClick();await flush();
 hold=null;count=17;await poll(15000);release({ok:true,json:async()=>old});await flush();assert.equal(rider().rows[0].total,17,'Slow old response overwrote current boards');
 count=18;realtime.lmhub_fetch_jobs({new:{status:'DONE'}});await fireTimeouts();assert.equal(rider().rows[0].total,18,'Completion must refresh both boards');
 fail=true;await poll(15000);assert.equal(rider().rows[0].total,18);assert.match(rider().error,/test network failure/);fail=false;
 document.visibilityState='hidden';const calls=boardCalls;await poll(15000);assert.equal(boardCalls,calls);
 document.visibilityState='visible';count=19;document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(rider().rows[0].total,19);
 // A first snapshot must finish the waiting state even when there was no baseline.
 for(const e of effects)e?.cleanup?.();states=[];effects=[];timeouts.clear();intervals.clear();snapshot=null;count=0;
 render();await fireTimeouts();button('Đồng bộ SPX').props.onClick();await flush();assert.ok([...intervals.values()].some(t=>t.ms===8000));
 snapshot='2026-10-28T01:10:00Z';count=3;await poll(8000);assert.ok(text(rendered).includes('Đã có snapshot pickup mới'));assert.ok(![...intervals.values()].some(t=>t.ms===8000));
 console.log('Pickup boards: shared data, external completion polling, manual refresh, stale response protection, errors, visibility and first snapshot passed.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{for(const e of effects)e?.cleanup?.()});

