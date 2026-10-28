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
 useId:()=> 'delivery-order-title',
 useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},
 useRef(initial){return hooks.useState(()=>({current:initial}))[0]},
 useMemo(fn){cursor++;return fn()},useCallback(fn,deps){const i=cursor++,old=states[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))states[i]={deps,value:fn};return states[i].value},
 useEffect(fn,deps){const i=cursor++,previous=effects[i];if(!previous||deps.some((v,j)=>!Object.is(v,previous.deps[j])))pending.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:fn()}})}
};
Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...args)};
Module._load=function(name,...args){
 if(name==='@/lib/supabase/client')return {createClient:()=>client};
 if(name==='react')return {...originalLoad.call(this,name,...args),...hooks};
 if(name==='@/hooks/use-supabase-realtime')return {useSupabaseRealtime:options=>{realtime[options.table]=options.onChange}};
 if(name==='@/components/layout/app-loading-store')return {useReportInitialDataLoading:()=>{}};
 if(name==='@/components/layout/filter-memory')return {useRememberedState:(_key,initial)=>hooks.useState(initial)};
 return originalLoad.call(this,name,...args);
};
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
Module._extensions['.css']=mod=>mod.exports={};
const {LmhubInventoryView}=require('../components/lmhub-inventory/lmhub-inventory-view.tsx');
let count=7,snapshot='A',stamp='2026-10-28T01:00:00Z',fail=false,headCalls=0,hold=null,replaceDuringPage=false;
const head=()=>snapshot?{snapshot_id:snapshot,snapshot_at:stamp}:null;
const client={from(table){const q={select(){return q},in(){return q},order(){return q},limit(){return q},eq(key,value){if(key==='snapshot_id')q.snapshot=value;return q},
 async maybeSingle(){if(table==='lmhub_fetch_jobs')return {data:{finished_at:stamp},error:null};headCalls++;if(hold)return hold;if(fail)throw Error('test network failure');return {data:head(),error:null}},
 async range(from,to){if(replaceDuringPage&&from>0){replaceDuringPage=false;snapshot='REPLACED';count=2;return {data:[],error:null}}return {data:q.snapshot===snapshot?Array.from({length:Math.max(0,Math.min(count-from,to-from+1))},(_,i)=>({snapshot_id:snapshot,snapshot_at:stamp,shipment_id:`${snapshot}-${from+i}`,area:'KV1',district:'Quận 1',ward:'Phường Tân Định',zone_id:'Z1',status:'LMHub_Received',order_type:'delivery',cot_group:'COT1',received_time:stamp})):[],error:null};}
 };return q}};
global.fetch=async(url,options)=>{assert.ok(String(url).startsWith('/api/lmhub-inventory/refresh'));return {ok:true,json:async()=>({success:true,queued:options?.method==='POST',pending:0,running:0,lastStatus:'DONE'})}};
function render(){cursor=0;pending=[];rendered=LmhubInventoryView({canQueue:true});for(const effect of pending)effect();return rendered}
function all(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(all);return [node,...all(node.props?.children)]}
function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children)}
function button(label){const found=all(rendered).find(n=>n.props?.onClick&&text(n)===label);assert.ok(found,`Missing button ${label}`);return found}
function report(){return all(rendered).find(n=>n.type?.name==='DeliveryBacklogReport')?.props}
async function flush(){for(let i=0;i<8;i++)await new Promise(setImmediate);render();render()}
async function fireTimeouts(){for(const [id,t] of [...timeouts]){timeouts.delete(id);t.fn()}await flush()}
async function poll(ms){const t=[...intervals.values()].find(t=>t.ms===ms);assert.ok(t,`Missing ${ms}ms poll`);t.fn();await flush()}
(async()=>{
 render();await flush();assert.equal(states[0].length,7);
 // A board selection opens an actual native dialog, without scrolling away from the board.
 const board=()=>all(rendered).find(n=>n.type?.name==='DeliveryInventoryBoard');
 const modal=()=>all(rendered).find(n=>n.type?.name==='DeliveryOrderDialog');
 assert.ok(!modal());
 const ward=board().props.districts[0].wards[0],focus={area:ward.area,district:ward.district,ward:ward.ward};
 board().props.onSelect(focus);render();assert.ok(modal());assert.equal(modal().props.total,7);assert.equal(modal().props.page,1);
 const modalProps=modal().props,Component=modal().type;
 const saved={states,effects,pending,cursor};states=[];effects=[];pending=[];cursor=0;
 const dialogTree=Component(modalProps);let opened=0,closed=0;
 states[0].current={showModal(){opened++},close(){closed++}};
 for(const effect of pending)effect();assert.equal(opened,1);assert.equal(dialogTree.type,'dialog');assert.equal(dialogTree.props['aria-modal'],'true');assert.equal(dialogTree.props['aria-labelledby'],'delivery-order-title');
 const cleanup=effects[1].cleanup;
 states=saved.states;effects=saved.effects;pending=saved.pending;cursor=saved.cursor;
 let prevented=false;dialogTree.props.onCancel({preventDefault(){prevented=true}});render();assert.ok(prevented);assert.ok(!modal());cleanup();assert.equal(closed,1);
 board().props.onSelect(focus);render();
 const target={getBoundingClientRect:()=>({left:100,right:800,top:100,bottom:700})};
 dialogTree.props.onClick({target,currentTarget:target,clientX:150,clientY:150});render();assert.ok(modal(),'Click within the dialog must not close it');
 dialogTree.props.onClick({target,currentTarget:target,clientX:20,clientY:20});render();assert.ok(!modal(),'Backdrop click closes the modal');
 board().props.onSelect(focus);render();modal().props.onClose();render();assert.ok(!modal());
 count=11;snapshot='B';stamp='2026-10-28T01:05:00Z';await poll(15000);assert.equal(states[0].length,11);assert.equal(report().snapshotAt,stamp);
 count=13;button('Làm mới').props.onClick();await flush();assert.equal(states[0].length,13);
 let release;const old=head();hold=new Promise(r=>release=r);button('Làm mới').props.onClick();await flush();
 hold=null;count=17;snapshot='C';await poll(15000);release({data:old,error:null});await flush();assert.equal(states[0].length,17,'Old response overwrote new data');
 count=18;realtime.lmhub_fetch_jobs({new:{status:'DONE'}});await fireTimeouts();assert.equal(states[0].length,18);
 count=1001;replaceDuringPage=true;await poll(15000);assert.equal(states[0].length,2,'Partial snapshot accepted');assert.equal(states[0][0].snapshot_id,'REPLACED');
 fail=true;await poll(15000);assert.equal(states[0].length,2);assert.ok(text(rendered).includes('test network failure'));fail=false;
 document.visibilityState='hidden';const calls=headCalls;await poll(15000);assert.equal(headCalls,calls);
 document.visibilityState='visible';count=19;document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(states[0].length,19);
 for(const e of effects)e?.cleanup?.();states=[];effects=[];timeouts.clear();intervals.clear();snapshot=null;stamp=null;count=0;
 render();await flush();button('Lấy dữ liệu mới').props.onClick();await flush();assert.ok([...intervals.values()].some(t=>t.ms===8000));
 // A successful empty publication must also stop waiting and clear both board/report.
 stamp='2026-10-28T01:10:00Z';await poll(8000);assert.equal(states[0].length,0);assert.equal(report().snapshotAt,stamp);assert.ok(text(rendered).includes('Đã có snapshot mới'));assert.ok(![...intervals.values()].some(t=>t.ms===8000));
 console.log('Delivery: modal selection/scope, native lifecycle, Escape/backdrop/close, pagination reset, external/manual refresh, late responses, publication during pagination, retained data on error, visibility and empty publication passed.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{for(const e of effects)e?.cleanup?.()});
