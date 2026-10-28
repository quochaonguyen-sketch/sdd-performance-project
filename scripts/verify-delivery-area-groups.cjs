// Real board interactions with synthetic counts; no browser, login or database required.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const resolve=Module._resolveFilename,load=Module._load;let cursor=0,states=[];
Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(process.cwd(),name.slice(2)):name,...args)};
Module._load=function(name,...args){const value=load.call(this,name,...args);if(name==='react')return {...value,useId:()=> 'delivery-test',useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]}};return value};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {DeliveryInventoryBoard}=require('../components/lmhub-inventory/delivery-inventory-board.tsx');
function district(area,name,cot1,cot2){return {area,district:name,totals:{cot1,cot2,total:cot1+cot2},wards:[{area,district:name,ward:'Phường minh họa',cot1,cot2,total:cot1+cot2}]};}
const districts=[district('KV3','Bình Tân',120,75),district('KV4','Tân Bình',100,78),district('KV3','Tân Phú',90,65),district('KV1','Quận 1',5,3),district('KV4','Quận 1',40,36)];
let selected=null;const props={districts,cot:'all',selected:null,onSelect:focus=>selected=focus};
function render(extra={}){cursor=0;return DeliveryInventoryBoard({...props,...extra})}
function all(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(all);return [node,...all(node.props?.children)]}
function button(tree,label){const result=all(tree).find(n=>n.type==='button'&&n.props['aria-label']===label);assert.ok(result,`Missing button ${label}`);return result}
function text(node){if(node==null)return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children)}
let tree=render();let groups=all(tree).filter(n=>n.props?.className==='delivery-area-group');
assert.deepEqual(groups.map(n=>n.props['data-area']),['KV1','KV3','KV4']);
const kv3=groups.find(n=>n.props['data-area']==='KV3');assert.ok(text(kv3).includes('350'));
assert.equal(all(kv3).filter(n=>n.type==='article').length,2);assert.ok(!text(kv3).includes('Tân Bình'));
assert.equal(all(tree).filter(n=>n.type==='table').length,0,'Districts initially show compact headers');
button(tree,'Mở KV3 · Bình Tân').props.onClick();tree=render();assert.equal(all(tree).filter(n=>n.type==='table').length,1);
button(tree,'Xem đơn Phường minh họa, KV3 · Bình Tân').props.onClick();assert.deepEqual(selected,{area:'KV3',district:'Bình Tân',ward:'Phường minh họa'});
button(tree,'Xem đơn KV4 · Quận 1').props.onClick();assert.deepEqual(selected,{area:'KV4',district:'Quận 1',ward:null});
const areaButton=all(tree).find(n=>n.type==='button'&&n.props['aria-controls']==='delivery-test-KV3');areaButton.props.onClick();tree=render();assert.equal(all(tree).find(n=>n.props?.id==='delivery-test-KV3').props.hidden,true);
all(tree).find(n=>n.type==='button'&&text(n)==='Mở tất cả').props.onClick();tree=render();assert.equal(all(tree).filter(n=>n.type==='table').length,5);assert.ok(all(tree).filter(n=>n.props?.className==='delivery-area-group-body').every(n=>!n.props.hidden));
all(tree).find(n=>n.type==='button'&&text(n)==='Thu tất cả').props.onClick();tree=render();assert.equal(all(tree).filter(n=>n.type==='table').length,0);assert.ok(all(tree).filter(n=>n.props?.className==='delivery-area-group-body').every(n=>n.props.hidden));
tree=render({forceExpanded:true});assert.equal(all(tree).filter(n=>n.type==='table').length,5);assert.ok(all(tree).filter(n=>n.props?.className==='delivery-area-group-body').every(n=>!n.props.hidden));
const scrolls=all(tree).filter(n=>n.props?.className==='delivery-district-scroll');assert.equal(scrolls.length,5);assert.ok(scrolls.every(n=>n.props.role==='region'&&n.props.tabIndex===0&&n.props['aria-label']));
const long=district('KV2','Quận 7',0,78);long.wards=Array.from({length:12},(_,i)=>({...long.wards[0],ward:`Phường ${i+1}`,cot1:0,cot2:i+1,total:i+1}));
tree=render({districts:[long],forceExpanded:true});assert.equal(all(tree).filter(n=>n.props?.className==='delivery-ward-row border-t border-slate-100').length,12,'All wards remain available in the scroll viewport');assert.ok(!all(tree).some(n=>n.props?.className==='delivery-ward-spacer'));
tree=render({cot:'cot1'});groups=all(tree).filter(n=>n.props?.className==='delivery-area-group');const summaries=all(groups.find(n=>n.props['data-area']==='KV3')).find(n=>n.type==='dl');const dd=all(summaries).filter(n=>n.type==='dd').map(text);assert.deepEqual(dd,['210','0','210 đơn']);
tree=render({districts:[]});assert.ok(text(tree).includes('Không có tồn phù hợp'));
console.log('Delivery area groups: KV order, grouped/filter totals, duplicate district scope, area/district toggles, ward drill-down, expand/collapse all, search expansion and empty state passed.');
