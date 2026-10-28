const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const dependencies=createRequire(fs.realpathSync(require.resolve('next/package.json')));
const postcss=dependencies('postcss'),lightning=dependencies('lightningcss');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function files(dir){return fs.readdirSync(path.join(__dirname,'..',dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const cssFiles=['tokens.css','app/design-system.css','app/workspace.css','app/realtime.css','app/dashboard.css',...files('components').filter(f=>f.endsWith('.css'))];
const root=postcss.parse(read('tokens.css'));
const variables=selector=>Object.fromEntries(root.nodes.filter(n=>n.type==='rule'&&n.selector===selector).flatMap(n=>n.nodes.filter(d=>d.type==='decl').map(d=>[d.prop,d.value])));
const light=variables(':root'),dark={...light,...variables('.dark')};
function resolve(name,theme,seen=[]){assert.ok(!seen.includes(name),`Circular token: ${name}`);const value=theme[name];assert.ok(value,`Missing token: ${name}`);const alias=value.match(/^var\((--[\w-]+)\)$/);return alias?resolve(alias[1],theme,[...seen,name]):value;}
function luminance(hex){assert.match(hex,/^#[0-9a-f]{6}$/i);const c=hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];}
function contrast(a,b,theme){const values=[a,b].map(n=>luminance(resolve('--color-'+n,theme))).sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}

test('all workspace styles parse and compile without using a browser',()=>{
 for(const file of cssFiles){const code=read(file);assert.doesNotThrow(()=>postcss.parse(code),file);assert.doesNotThrow(()=>lightning.transform({filename:file,code:Buffer.from(code),minify:true,errorRecovery:false}),file);}
});

for(const [name,theme] of Object.entries({light,dark}))test(`${name}: semantic text, status and control contrast`,()=>{
 for(const ink of ['ink','ink-2','muted','accent'])for(const paper of ['paper','paper-2','paper-3'])assert.ok(contrast(ink,paper,theme)>=4.5,`${name} ${ink}/${paper}`);
 for(const hue of ['success','warning','error','purple','rose','cyan','info'])assert.ok(contrast(hue,hue+'-soft',theme)>=4.5,`${name} ${hue} badge`);
 for(const fill of ['accent','accent-hover'])assert.ok(contrast('accent-ink',fill,theme)>=4.5,`${name} button ${fill}`);
 for(const paper of ['paper','paper-2'])for(const control of ['rule-strong','focus'])assert.ok(contrast(control,paper,theme)>=3,`${name} ${control}/${paper}`);
 assert.ok(contrast('inverse-muted','graphite',theme)>=4.5);
 for(let i=1;i<=7;i++)resolve(`--color-chart-${i}`,theme);
});

test('feature aliases keep text and surfaces on the correct semantic roles in dark mode',()=>{
 for(const file of cssFiles){const ast=postcss.parse(read(file));ast.walkDecls(d=>{
  if(d.prop==='--ink'||d.prop==='--ds-ink')assert.equal(d.value,'var(--color-ink)',`${file} ${d.parent.selector}`);
  if(d.prop==='color')assert.ok(!/^var\(--color-rule(?:-strong)?\)$/.test(d.value),`${file}: border token used as text`);
  for(const [,token] of d.value.matchAll(/var\((--color-[\w-]+)/g))assert.ok(light[token],`${file}: undefined ${token}`);
 });}
});

function applicable(node,width){for(let p=node.parent;p;p=p.parent)if(p.type==='atrule'&&p.name==='media'){for(const m of p.params.matchAll(/(min|max)-width:\s*(\d+)px/g)){if(m[1]==='max'&&width>+m[2]||m[1]==='min'&&width<+m[2])return false;}}return true;}
function value(file,selector,property,width){let result;postcss.parse(read(file)).walkRules(r=>{if(r.selectors.includes(selector)&&applicable(r,width))r.walkDecls(property,d=>result=d.value)});return result;}
test('delivery district viewport is eight fixed rows with sticky bands and independent keyboard scrolling',()=>{
 const file='components/lmhub-inventory/delivery-inventory.css';
 for(const width of [375,768,1440]){
  assert.equal(value(file,'.delivery-district-scroll','--delivery-visible-wards',width),'8');
  assert.equal(value(file,'.delivery-district-scroll','--delivery-ward-row-height',width),'36px');
  assert.equal(value(file,'.delivery-district-scroll','--delivery-table-band-height',width),'36px');
  assert.equal(value(file,'.delivery-district-scroll','height',width),'calc(var(--delivery-ward-row-height) * var(--delivery-visible-wards) + var(--delivery-table-band-height) * 2)');
  assert.equal(value(file,'.delivery-district-scroll','overflow',width),'auto');
  assert.equal(value(file,'.delivery-district-scroll thead','position',width),'sticky');
  assert.equal(value(file,'.delivery-district-scroll tfoot','position',width),'sticky');
  assert.equal(value(file,'.delivery-district-scroll tbody th>button','white-space',width),'nowrap');
 }
});
test('responsive cascade at 375, 768 and 1440px preserves readable inputs and wrapping headers',()=>{
 const file='app/design-system.css',input='.workspace-content :where(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden]),select,textarea)';
 assert.equal(value(file,input,'font-size',375),'16px');
 assert.equal(value(file,input,'font-size',768),'14px');
 assert.equal(value(file,'.app-main','padding',375),'20px 16px 100px');
 assert.equal(value(file,'.workspace-content h1','font-size',375),'23px');
 assert.equal(value(file,'.workspace-content h1','font-size',1440),'26px');
 assert.equal(value('components/linehaul/linehaul.module.css','.header h1','flex-wrap',375),'wrap');
 assert.equal(value('components/linehaul/linehaul.module.css','.loadCards','grid-template-columns',375),'minmax(0,1fr)');
 assert.equal(value('components/data-sources/data-sources.css','.ds-source-grid','grid-template-columns',375),'minmax(0,1fr)');
});
