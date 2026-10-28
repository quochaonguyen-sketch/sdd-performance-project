const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const resolve=Module._resolveFilename,load=Module._load,root=process.cwd();let control=false,states=[],i=0;
Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...args)};
Module._load=function(name,...args){
 if(name==='next/navigation')return {usePathname:()=>'/performance',useSearchParams:()=>new URLSearchParams()};
 if(name==='react'&&control){const r=load.call(this,name,...args);return {...r,useState:initial=>{const n=i++;if(!(n in states))states[n]=initial;return [states[n],v=>states[n]=v]},useRef:()=>({current:null}),useEffect:()=>{}}}
 return load.call(this,name,...args);
};
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
Module._extensions['.css']=mod=>mod.exports={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{parsePerformanceFilters}=require('../lib/performance/filters.ts');
const {DriverPerformanceView}=require('../components/performance/driver-performance-view.tsx');
const filters=parsePerformanceFilters(new URLSearchParams({date:'2026-10-28'}));
const base={report_date:'2026-10-28',driver_id:'1',rider_name:'Rider',driver_name:'Rider',kv:'KV1',cot:'COT2',pickup_district:'Q1',delivery_district:'Q1',delivery_ward:'Ward',delivery_assigned:10,delivery_delivered:9,delivery_assigned_cot1:0,delivery_delivered_cot1:0,delivery_assigned_cot2:10,delivery_delivered_cot2:9,pickup_assigned:3,pickup_picked:3,pickup_assigned_cot1:1,pickup_picked_cot1:1,pickup_assigned_cot2:2,pickup_picked_cot2:2};
const fixture={rows:[base,{...base,driver_id:'2',cot:'COT1'},{...base,driver_id:'3',pickup_picked_cot1:0}],summary:{groups:3,active_riders:3,delivery_assigned:30,delivery_delivered:27,pickup_assigned:9,pickup_picked:9},options:{districts:[],cots:['COT1','COT2'],wards:[]}};
for(const [driver_id,c1,c2] of [['163735',12,15],['165712',27,21],['165193',3,15]])fixture.rows.push({...base,driver_id,pickup_assigned:0,pickup_picked:0,pickup_assigned_cot1:c1,pickup_picked_cot1:c1,pickup_assigned_cot2:c2,pickup_picked_cot2:c2});
const html=renderToStaticMarkup(React.createElement(DriverPerformanceView,{result:fixture,filters,error:null,loadedKey:'test'}));
assert.equal((html.match(/class="pickupWarning"/g)||[]).length,1);assert.ok(html.includes('Rider COT2 có 1 đơn Pick COT1'));assert.ok(html.includes('Chọn ngày hoặc khoảng ngày thống kê'));assert.ok(!html.includes('Chọn chu kỳ thống kê'));
control=true;delete require.cache[require.resolve('../components/performance/performance-date-picker.tsx')];const {PerformanceDatePicker}=require('../components/performance/performance-date-picker.tsx');let params=new URLSearchParams({kv:'KV2',q:'Test',page:'3'});
function render(){i=0;return PerformanceDatePicker({filters,updateParams:mutate=>mutate(params)})}
function all(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(all);return [node,...all(node.props?.children)]}
let tree=render();let form=all(tree).find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});assert.equal(params.get('period'),'day');assert.equal(params.get('kv'),'KV2');
function click(day){tree=render();const cell=all(tree).find(n=>n.props?.['data-day']===day);assert.ok(cell,`Missing calendar day ${day}`);cell.props.onClick();tree=render()}
click('2026-10-20');click('2026-10-28');
all(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(params.get('start'),'2026-10-20');assert.equal(params.get('end'),'2026-10-28');assert.equal(params.get('page'),'1');
click('2026-11-05');click('2026-10-20');all(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(params.get('start'),'2026-10-20');assert.equal(params.get('end'),'2026-11-05');
click('2026-10-22');click('2026-10-22');all(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(params.get('period'),'day');assert.equal(params.get('date'),'2026-10-22');
global.requestAnimationFrame=fn=>fn();tree=render();all(tree).find(n=>n.props?.['data-day']==='2026-10-31').props.onKeyDown({key:'ArrowRight',preventDefault(){}});tree=render();assert.equal(all(tree).find(n=>n.props?.['data-day']==='2026-11-01').props.tabIndex,0);
all(tree).find(n=>n.props?.['aria-label']==='Tháng trước').props.onClick();tree=render();assert.ok(all(tree).some(n=>n.props?.['data-day']==='2026-10-01'));
console.log('Performance controls: calendar range selection, reverse/cross-month and single-day ranges, keyboard navigation, retained filters and COT2-only warning passed.');
