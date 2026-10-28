// Real component interactions using synthetic multi-area riders; no browser or live data.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const resolve=Module._resolveFilename,load=Module._load;let cursor=0,states=[];
Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(process.cwd(),name.slice(2)):name,...args)};
Module._load=function(name,...args){const r=load.call(this,name,...args);if(name==='react')return {...r,useId:()=> 'rider-board',useMemo:fn=>fn(),useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]}};return r};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
require.extensions['.css']=()=>{};
const {PickupRiderInventory}=require('../components/lmhub-inventory/pickup-rider-inventory.tsx');
const row=(area,id,name,cot,total,zones)=>({area,ward:'Phường minh họa',rider_code:id,rider_name:name,rider_cot:cot,total,cot1:total,cot2:0,zones});
const rows=[row('KV3','3','Chưa phân COT','UNKNOWN',4,['ZONE-D']),row('KV1','1','Nguyễn Văn An','COT1',7,['ZONE-A']),row('KV2','1','Nguyễn Văn An','COT1',3,['ZONE-C']),row('KV1','2','Trần Văn Bình','COT2',5,['ZONE-A']),row('KV1','1','Nguyễn Văn An','COT1',2,['ZONE-B'])];
const props={area:'all',cot:'all',status:'Assigned',rows,loading:false,error:null};
function render(extra={}){cursor=0;return PickupRiderInventory({...props,...extra})}
function all(n){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(all);return [n,...all(n.props?.children)]}
function text(n){if(n==null||typeof n==='boolean')return '';if(typeof n!=='object')return String(n);return Array.isArray(n)?n.map(text).join(''):text(n.props?.children)}
function groups(tree){return all(tree).filter(n=>n.type==='section'&&n.props['data-area'])}
let tree=render();assert.deepEqual(groups(tree).map(g=>g.props['data-area']),['KV1','KV2','KV3']);
assert.deepEqual(all(tree).filter(n=>n.type==='dd').map(text),['3','1','1','3'],'Multi-area riders count once in the summary');
assert.ok(text(tree).includes('Chưa rõ COT'));assert.ok(text(tree).includes('không cộng các dòng'));
const kv1=groups(tree)[0];const first=all(kv1).find(n=>n.props?.className==='pickup-rider-name');assert.equal(text(first),'Nguyễn Văn An');
all(kv1).find(n=>n.type==='button'&&n.props['aria-label']==='Xem 9 đơn Nguyễn Văn An, KV1').props.onClick();tree=render();
let modal=all(tree).find(n=>n.type?.name==='PickupOrderDialog');assert.equal(modal.props.scope.area,'KV1');assert.equal(modal.props.scope.rider,'1');assert.equal(modal.props.scope.riderCot,'COT1');assert.equal(modal.props.scope.cot,'all');modal.props.onClose();
tree=render();all(tree).find(n=>n.type==='button'&&n.props['aria-label']==='Xem 3 đơn Nguyễn Văn An, KV2').props.onClick();tree=render();modal=all(tree).find(n=>n.type?.name==='PickupOrderDialog');assert.equal(modal.props.scope.area,'KV2');modal.props.onClose();
tree=render();all(tree).find(n=>n.type==='button'&&text(n)==='Thu tất cả').props.onClick();tree=render();assert.ok(all(tree).filter(n=>n.props?.className==='pickup-rider-table-scroll').every(n=>n.props.hidden));
all(tree).find(n=>n.type==='button'&&text(n)==='Mở tất cả').props.onClick();tree=render();assert.ok(all(tree).filter(n=>n.props?.className==='pickup-rider-table-scroll').every(n=>!n.props.hidden));
all(tree).find(n=>n.type==='input').props.onChange({target:{value:'zone-b'}});tree=render();assert.deepEqual(groups(tree).map(n=>n.props['data-area']),['KV1']);
all(tree).find(n=>n.type==='input').props.onChange({target:{value:'nguyen van an'}});tree=render();assert.equal(groups(tree).length,2);
all(tree).find(n=>n.type==='input').props.onChange({target:{value:''}});tree=render({cot:'cot2'});assert.equal(groups(tree).length,1);assert.ok(text(tree).includes('Trần Văn Bình'));assert.ok(!text(tree).includes('Nguyễn Văn An'));
assert.equal(groups(render({loading:true})).length,0);assert.ok(text(render({rows:[]})).includes('Không có rider phù hợp'));
tree=render({error:'Không tải được dữ liệu'});assert.ok(all(tree).some(n=>n.props?.role==='alert'));assert.ok(all(tree).find(n=>n.props?.className==='pickup-rider-export').props.disabled);
console.log('Rider UI: area grouping, unique rider summaries, scoped modal, COT semantics, sorting, search, collapse, loading/error/empty and export state passed.');
