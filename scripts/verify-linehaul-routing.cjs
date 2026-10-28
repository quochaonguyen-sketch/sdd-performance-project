// Exercise the authenticated route with a stub routing service; no real GPS is sent.
(async()=>{
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
 let context=null,trip={trip_id:'123',phase:'en_route',lat:10.9,lng:106.6,hub_lat:10.8,hub_lng:106.65,gps_at:'a'},reads=0,calls=0,fail=false,missing=false,expectedBase='https://router.project-osrm.org';
 const db={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>{reads++;return {data:{trips:missing?[]:[trip]}};}})};
 const resolve=Module._resolveFilename,original=Module._load;
 Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(process.cwd(),name.slice(2)):name,parent,...args);};
 Module._load=function(name,...args){
  if(name==='server-only')return {};
  if(name==='@/lib/auth/current-user')return {getCurrentUserContext:async()=>context};
  if(name==='@/lib/supabase/admin')return {createAdminClient:()=>db};
  return original.call(this,name,...args);
 };
 Module._extensions['.ts']=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);};
 process.env.NODE_ENV='development';delete process.env.LINEHAUL_ROUTING_URL;
 global.fetch=async(url)=>{
  calls++;assert.ok(url.startsWith(expectedBase+'/route/v1/driving/'));assert.ok(url.includes('/106.6,10.9;106.65,10.8?'));assert.ok(!url.includes('999'));
  return fail?new Response('',{status:503}):Response.json({code:'Ok',routes:[{distance:12000,geometry:{type:'LineString',coordinates:[[106.6,10.9],[106.65,10.8]]}}],waypoints:[{distance:0},{distance:0}]});
 };
 const {GET}=require('../app/api/linehaul/route/route.ts');
 const request=(query='trip_id=123')=>new Request('http://localhost/api/linehaul/route?'+query);
 assert.equal((await GET(request())).status,401);
 context={profile:{role:'member',permissions:{manage_dashboard:false}}};assert.equal((await GET(request())).status,403);
 assert.equal(reads,0);assert.equal(calls,0);
 context.profile.permissions.manage_dashboard=true;
 assert.equal((await GET(request('trip_id=../x'))).status,400);
 missing=true;assert.equal((await GET(request())).status,404);missing=false;
 let response=await GET(request('trip_id=123&lat=999&url=http://attacker'));
 assert.equal(response.status,200);assert.equal((await response.json()).distanceMeters,12000);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 await Promise.all([GET(request()),GET(request())]);assert.equal(calls,1,'Identical GPS reuses cached route');
 trip.lat=null;assert.equal((await GET(request())).status,503);assert.equal(calls,1);trip.lat=10.9;
 trip.phase='departed';assert.equal((await GET(request())).status,503);assert.equal(calls,1);trip.phase='en_route';
 trip.gps_at='b';fail=true;response=await GET(request());assert.equal(response.status,503);
 assert.ok(!(await response.json()).points);assert.equal(calls,2);
 process.env.NODE_ENV='production';fail=false;
 response=await GET(request());assert.equal(response.status,200);assert.equal(calls,3);
 const productionRoute=await response.json();assert.equal(productionRoute.distanceMeters,12000);assert.equal(productionRoute.points.length,2);
 await GET(request());assert.equal(calls,3,'Production shares cached distance and map geometry');
 process.env.LINEHAUL_ROUTING_URL='   ';await GET(request());assert.equal(calls,3,'Blank config also uses the default service');
 process.env.LINEHAUL_ROUTING_URL=' https://routing.example.test/osrm/ ';expectedBase='https://routing.example.test/osrm';
 response=await GET(request());assert.equal(response.status,200);assert.equal(calls,4,'Configured routing service takes priority over the default');
 process.env.LINEHAUL_ROUTING_URL='https://routing.example.test/?secret=x';
 response=await GET(request());assert.equal(response.status,503);assert.equal(calls,4);
 console.log('LH routing: permissions, snapshot GPS, cache, missing GPS, departed vehicles, service failure/retry, production default, blank config and custom service checks passed.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
