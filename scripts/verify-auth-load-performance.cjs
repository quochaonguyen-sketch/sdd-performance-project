// Real current-user loader with delayed I/O: verify concurrency and fail-closed authorization.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const originalLoad=Module._load,resolve=Module._resolveFilename,root=process.cwd();
let claims,profile,authResult,profileRequests=0,authRequests=0,profileWait=null,authWait=null;
const admin={from(table){assert.equal(table,'profiles');return {select(){return this},eq(){return this},maybeSingle(){profileRequests++;return profileWait??Promise.resolve({data:profile,error:null})}}},auth:{admin:{getUserById(id){assert.equal(id,'user-id');authRequests++;return authWait??Promise.resolve(authResult)}}}};
Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...args)};
Module._load=function(name,...args){
 if(name==='server-only')return {};
 if(name==='react')return {cache:fn=>fn};
 if(name==='@/lib/supabase/server')return {createClient:async()=>({auth:{getClaims:async()=>claims}})};
 if(name==='@/lib/supabase/admin')return {createAdminClient:()=>admin};
 if(name==='@/lib/auth/role-access-server')return {loadRoleAccess:async()=>({})};
 if(name==='@/lib/auth/permissions')return {normalizePermissions:permissions=>permissions};
 if(name==='@/lib/auth/rider-scope')return {normalizeRiderEditAreas:areas=>areas??[]};
 if(name==='@/lib/auth/page-access')return {viewPermissions:permissions=>permissions};
 return originalLoad.call(this,name,...args);
};
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {getCurrentUserContext}=require('../lib/auth/current-user.ts');
function reset(){claims={data:{claims:{sub:'user-id',email:'person@spxexpress.com'}},error:null};profile={role:'admin',full_name:'Test'};authResult={data:{user:{app_metadata:{permissions:{manage_dashboard:true},rider_edit_areas:['KV1']},user_metadata:{permissions:{manage_dashboard:false}}}},error:null};profileRequests=0;authRequests=0;profileWait=null;authWait=null}
(async()=>{
 reset();let releaseProfile,releaseAuth;profileWait=new Promise(r=>releaseProfile=r);authWait=new Promise(r=>releaseAuth=r);
 const pending=getCurrentUserContext();for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(profileRequests,1);assert.equal(authRequests,1,'Profile and fresh account metadata must start together');
 releaseProfile({data:profile,error:null});releaseAuth(authResult);const user=await pending;
 assert.equal(user.profile.permissions.manage_dashboard,true,'Must use trusted app_metadata');assert.deepEqual(user.profile.rider_edit_areas,['KV1']);
 reset();claims={data:null,error:Error('invalid session')};assert.equal(await getCurrentUserContext(),null);assert.equal(authRequests+profileRequests,0);
 reset();claims.data.claims.email='person@outside.example';assert.equal(await getCurrentUserContext(),null);assert.equal(authRequests+profileRequests,0);
 reset();profile=null;assert.equal(await getCurrentUserContext(),null);
 reset();authResult={data:{user:null},error:Error('metadata unavailable')};await assert.rejects(getCurrentUserContext(),/quyền hiện tại/);
 console.log('Current-user: parallel reads, trusted permissions, invalid sessions/domain, missing profiles and metadata failures passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
