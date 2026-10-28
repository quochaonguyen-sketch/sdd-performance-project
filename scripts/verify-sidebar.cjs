// Render navigation without a session; verify grouping, active routes and role visibility.
(async()=>{
 const fs=await import('node:fs'),path=await import('node:path'),{default:Module}=await import('node:module'),{default:ts}=await import('typescript'),assert=await import('node:assert/strict');
 const root=process.cwd(),resolve=Module._resolveFilename,originalLoad=Module._load;
 let pathname='/volume/delivery';
 const realComponents=new Set(['app-shell','navigation-group','sidebar-navigation','app-brand']);
 Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...args);};
 Module._load=function(name,...args){
  if(name==='@/components/layout/filter-memory')return {useRememberedLinks:()=>href=>href};
  if(name==='next/navigation')return {usePathname:()=>pathname.split('?')[0],useSearchParams:()=>new URLSearchParams(pathname.split('?')[1]),useRouter:()=>({})};
  if(name.startsWith('@/components/')&&!realComponents.has(name.split('/').pop()))return new Proxy({__esModule:true},{get:(target,key)=>key==='__esModule'?true:()=>null});
  if(name==='@/lib/supabase/client')return {createClient:()=>{throw Error('Unexpected Supabase call');}};
  return originalLoad.call(this,name,...args);
 };
 for(const extension of ['.ts','.tsx'])Module._extensions[extension]=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);};
 const load=Module.createRequire(__filename),React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server'),{AppShell}=load('../components/layout/app-shell.tsx');
 for(const role of ['admin','leader','member'])for(const route of ['/volume/delivery','/volume/pickup','/onhold','/pickup-management','/pickup-management?view=replacement','/return-orders']){
  pathname=route;
  const html=renderToStaticMarkup(React.createElement(AppShell,{user:{email:'preview@example.com',fullName:'Preview',role}},React.createElement('p',null,'Preview')));
  const sidebar=html.split('aria-label="Main navigation"')[1].split('</nav>')[0];
  const groups=[...sidebar.matchAll(/<details[^>]*>[\s\S]*?<\/details>/g)].map(match=>match[0]);
  const volume=groups.find(group=>group.includes('<span>Volume</span>'));
  assert.ok(volume,'Volume submenu missing');
  for(const href of ['/volume/delivery','/volume/pickup'])assert.equal((sidebar.match(new RegExp(`href="${href}"`,'g'))??[]).length,1);
  if(route.startsWith('/volume/')){
   assert.match(volume,/^<details[^>]*open=""/);
   assert.ok([...volume.matchAll(/<a\b[^>]*>/g)].some(([link])=>link.includes(`href="${route}"`)&&link.includes('aria-current="page"')));
  }
  let position=-1;
  for(const label of ['Dashboard','Live Monitoring','Backlog','Volume','Rider Performance','On-Hold Analytics']){
   const next=sidebar.indexOf(`>${label}</span>`);assert.ok(next>position,`Unexpected order: ${label}`);position=next;
  }
  assert.equal(sidebar.includes('Pickup Points'),role!=='member');
  const mobile=html.split('class="app-more-grid"')[1].split('</section>')[0];
  assert.ok(mobile.includes('<span>Volume</span>'));
  const pickup=groups.find(group=>group.includes('<span>Pickup Management</span>'));
  assert.equal(Boolean(pickup),role!=='member');
  if(role!=='member'){
   assert.ok(pickup.includes('Pickup Points')&&pickup.includes('Pickup Coverage'));
   assert.ok(sidebar.indexOf('>Return Orders</span>')<sidebar.indexOf('>Pickup Management</span>'));
   assert.ok(mobile.indexOf('>Return Orders</span>')<mobile.indexOf('>Pickup Management</span>'));
   if(route.startsWith('/pickup-management')){
    assert.match(pickup,/^<details[^>]*open=""/);
    const activeLinks=[...pickup.matchAll(/<a\b[^>]*>/g)].filter(([link])=>link.includes('aria-current="page"'));
    assert.equal(activeLinks.length,1);assert.ok(activeLinks[0][0].includes(`href="${route}"`));
   }
  }
  if(role==='admin'&&route==='/volume/delivery')fs.writeFileSync(path.join(root,'.next/sidebar-preview.html'),`<!doctype html><html><head><meta charset="utf-8"><style>${fs.readFileSync(path.join(root,'app/workspace.css'),'utf8')}</style></head><body>${html}</body></html>`);
 }
 pathname='/pickup-realtime';
 const {normalizePageAccess}=load('../lib/auth/page-access.ts');
 const restricted=renderToStaticMarkup(React.createElement(AppShell,{user:{email:'preview@example.com',fullName:'Preview',role:'leader',pageAccess:normalizePageAccess('leader',{delivery_realtime:false,team:false,pickup_management:false})}},React.createElement('p',null,'Preview')));
 assert.ok(restricted.includes('href="/pickup-realtime"'),'Allowed second item must remain visible when first item in group is denied');
 assert.ok(!restricted.includes('href="/team"'));assert.ok(!restricted.includes('href="/realtime-dashboard"'));assert.ok(!restricted.includes('href="/pickup-management"'));
 console.log('Sidebar order, unique Volume links, active submenu, mobile grouping and role visibility passed.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
