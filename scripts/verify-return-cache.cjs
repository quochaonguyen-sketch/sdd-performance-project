// Exercise the real loader/API with a fake database; no credentials or writes.
(async()=>{
 const fs=await import('node:fs'),path=await import('node:path'),{default:Module}=await import('node:module'),{default:ts}=await import('typescript'),assert=await import('node:assert/strict');
 const root=process.cwd(),resolve=Module._resolveFilename,originalLoad=Module._load;
 let current='A',heads=[],rowReads=0,headReads=0,failRows=false,failHead=false,authenticated=true,allowed=true;
 const stamp=id=>`2026-10-27T00:00:0${id.charCodeAt(0)-65}.000Z`;
 const db={from:()=>({select(){return this;},order(){return this;},limit(){return this;},eq(key,value){this.id=value;return this;},in(){return this;},range(){return this;},
  async maybeSingle(){headReads++;if(failHead)return {error:Error('offline')};const id=heads.length?heads.shift():current;return {data:id?{snapshot_id:id,snapshot_at:stamp(id)}:null};},
  async returns(){rowReads++;return failRows?{error:Error('offline')}:{data:[{shipment_id:this.id,order_status:67}]};}
 })};
 Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...args);};
 Module._load=function(name,...args){
  if(name==='server-only')return {};
  if(name==='@/lib/supabase/admin')return {createAdminClient:()=>db};
  if(name==='@/lib/auth/current-user')return {getCurrentUserContext:async()=>authenticated?{profile:{role:'admin',permissions:[]}}:null};
  if(name==='@/lib/auth/permissions')return {canManageReturn:()=>allowed};
  return originalLoad.call(this,name,...args);
 };
 Module._extensions['.ts']=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);};
 const load=Module.createRequire(__filename),{getReturnWorkspace}=load('../lib/return-orders/workspace-server.ts'),{GET}=load('../app/api/return-orders/route.ts');
 const request=etag=>new Request('http://localhost/api/return-orders',{headers:etag?{'If-None-Match':etag}:{}});
 const first=await Promise.all([getReturnWorkspace(),getReturnWorkspace()]);
 assert.equal(rowReads,1);assert.equal(first[0].rows[0].shipment_id,'A');assert.equal(headReads,4);
 const unchanged=await GET(request(JSON.stringify(stamp('A'))));
 assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');assert.equal(rowReads,1);
 current='B';const changed=await GET(request(JSON.stringify(stamp('A'))));
 assert.equal(changed.status,200);assert.equal((await changed.json()).rows[0].shipment_id,'B');assert.equal(rowReads,2);
 failHead=true;assert.equal((await GET(request())).status,503);failHead=false;
 current='C';failRows=true;await assert.rejects(getReturnWorkspace());failRows=false;
 assert.equal((await getReturnWorkspace()).rows[0].shipment_id,'C');assert.equal(rowReads,4);
 heads=['D','E','E','E'];current='E';assert.equal((await getReturnWorkspace()).rows[0].shipment_id,'E');
 const reads=headReads;authenticated=false;assert.equal((await GET(request())).status,401);authenticated=true;allowed=false;assert.equal((await GET(request())).status,403);assert.equal(headReads,reads);
 allowed=true;current=null;assert.equal((await GET(request())).status,200);
 console.log('Return cache: deduplicated reads, unchanged 304, snapshot invalidation, publication race, failed-read retry and auth guards passed.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
