const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const resolve=Module._resolveFilename,load=Module._load;let states=[],cursor=0;
Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(process.cwd(),name.slice(2)):name,...args)};
Module._load=function(name,...args){const r=load.call(this,name,...args);if(name==='react')return {...r,useEffect:()=>{},useCallback:fn=>fn,useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]}};return r};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
require.extensions['.css']=()=>{};
const {DataSourcesView}=require('../components/data-sources/data-sources-view.tsx'),{DATA_SOURCES}=require('../lib/data-sources/catalog.ts');
const job=(id,source_id,status)=>({id,source_id,status,phase:'finished',report_date:'2026-10-28',message:'Test message',requested_at:'2026-10-28T12:00:00Z',started_at:'2026-10-28T12:00:00Z',finished_at:status==='RUNNING'?null:'2026-10-28T12:00:01Z',events:[]});
const fixture={sources:[DATA_SOURCES[0],DATA_SOURCES[1],DATA_SOURCES[3]].map(s=>({...s,canControl:true})),settings:[],workers:[],jobs:[job('a','linehaul','SUCCEEDED'),job('b','delivery_realtime','RUNNING'),job('c','pickup_inventory','FAILED'),job('old','linehaul','FAILED')],serverTime:'2026-10-28T12:00:10Z',canControl:true};states[0]=fixture;
function render(){cursor=0;return DataSourcesView()}
function all(n){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(all);return [n,...all(n.props?.children)]}
function text(n){if(n==null||typeof n==='boolean')return '';if(typeof n!=='object')return String(n);return Array.isArray(n)?n.map(text).join(''):text(n.props?.children)}
function cards(t){return all(t).filter(n=>n.props?.className==='ds-source-card')}
function filter(t,label){return all(t).find(n=>n.type==='button'&&text(n).startsWith(label)&&n.props['aria-pressed']!==undefined)}
let tree=render();assert.equal(cards(tree).length,3);assert.equal(text(filter(tree,'Thất bại')),'Thất bại1','Historical failure is not a current failed source');assert.equal(text(filter(tree,'Chờ / chạy')),'Chờ / chạy1');assert.ok(!all(tree).some(n=>n.type?.name==='SpxSession'));
filter(tree,'Thất bại').props.onClick();tree=render();assert.deepEqual(cards(tree).map(n=>n.props['aria-label']),['Tồn Pickup']);
filter(tree,'Chờ / chạy').props.onClick();tree=render();assert.deepEqual(cards(tree).map(n=>n.props['aria-label']),['Delivery Realtime']);
const stop=all(cards(tree)[0]).find(n=>n.props?.className==='ds-stop-button');assert.equal(stop.props.disabled,false);assert.ok(all(cards(tree)[0]).find(n=>n.props?.className==='ds-run-button').props.disabled);
filter(tree,'Tất cả').props.onClick();tree=render();all(tree).find(n=>n.props?.['aria-label']==='Tìm nguồn dữ liệu').props.onChange({target:{value:'ton pickup'}});tree=render();assert.equal(cards(tree).length,1);assert.equal(cards(tree)[0].props['aria-label'],'Tồn Pickup');
all(tree).find(n=>n.props?.['aria-label']==='Tìm nguồn dữ liệu').props.onChange({target:{value:'no-match'}});tree=render();assert.ok(text(tree).includes('Không có nguồn khớp bộ lọc.'));all(tree).find(n=>n.type==='button'&&text(n)==='Đặt lại bộ lọc').props.onClick();tree=render();assert.equal(cards(tree).length,3);
let session=all(tree).find(n=>n.props?.className==='ds-session-panel');session.props.onToggle({currentTarget:{open:true}});tree=render();assert.ok(all(tree).some(n=>n.type?.name==='SpxSession'));all(tree).find(n=>n.props?.className==='ds-session-panel').props.onToggle({currentTarget:{open:false}});tree=render();assert.ok(all(tree).some(n=>n.type?.name==='SpxSession'),'Keep entered form values on collapse');
fixture.canControl=false;fixture.sources=fixture.sources.map(s=>({...s,canControl:false}));tree=render();assert.ok(!all(tree).some(n=>n.props?.className==='ds-session-panel'));assert.ok(all(tree).filter(n=>n.props?.className==='ds-run-button'||n.props?.className==='ds-stop-button').every(n=>n.props.disabled));
console.log('Data Sources UI: current-status counts, filters, accent-insensitive search/reset, lazy session with retained forms, disabled controls and permissions passed.');
