// Render the real map component with Leaflet stubs to check route and GPS states.
(async()=>{
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
 const resolve=Module._resolveFilename,original=Module._load;
 let injected=null,polyline=null,hook=0;
 Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(process.cwd(),name.slice(2)):name,parent,...args);};
 Module._load=function(name,...args){
  if(name==='react-leaflet'){
   const React=original.call(this,'react',...args);
   return {MapContainer:({children})=>React.createElement('div',null,children),CircleMarker:({children})=>React.createElement('div',null,children),
    Tooltip:({children})=>React.createElement('span',null,children),TileLayer:()=>null,useMap:()=>({}),
    Polyline:props=>{polyline=props.positions;return React.createElement('span',null,props.children);}};
  }
  const result=original.call(this,name,...args);
  if(name==='react')return {...result,useState:initial=>result.useState(hook++===0?injected:initial)};
  return result;
 };
 for(const extension of ['.ts','.tsx'])Module._extensions[extension]=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);};
 Module._extensions['.css']=mod=>{mod.exports={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};};
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{default:Map}=require('../components/linehaul/linehaul-map.tsx'),{roadRouteKey}=require('../lib/linehaul/road-route.ts');
 const now=Date.now(),trip={trip_id:'A',phase:'en_route',lat:10.9,lng:106.6,hub_lat:10.8,hub_lng:106.65,gps_at:new Date(now).toISOString(),plate_number:'TEST'};
 const key=roadRouteKey(trip),route={key,distanceMeters:26226.6,points:[[10.9,106.6],[10.8,106.65]]};
 function render(value=trip){hook=0;polyline=null;return renderToStaticMarkup(React.createElement(Map,{trip:value,now}));}
 assert.ok(render().includes('Đang tính đường bộ'));
 injected={key,route};let html=render();
 for(const text of ['26,2 km','đến hub','Đường ô tô','Có thể khác tuyến xe tải'])assert.ok(html.includes(text),text);
 assert.deepEqual(polyline,route.points);
 const stale={...trip,gps_at:new Date(now-3600000).toISOString()};injected={key:roadRouteKey(stale),route};assert.ok(render(stale).includes('Ước tính từ GPS cũ'));
 injected={key,route};html=render({...trip,trip_id:'B'});assert.ok(!html.includes('26,2 km'));assert.equal(polyline,null);
 html=render({...trip,lat:10.91});assert.ok(!html.includes('26,2 km'));assert.equal(polyline,null);
 injected={key,error:'Không tìm được đường'};html=render();assert.ok(html.includes('Không tìm được đường'));assert.ok(html.includes('Thử lại'));assert.equal(polyline,null);
 injected={key,route};html=render({...trip,phase:'departed'});assert.ok(html.includes('Xe đã rời hub'));assert.equal(polyline,null);
 html=render({...trip,hub_lat:null});assert.ok(html.includes('chưa cung cấp tọa độ hub'));assert.equal(polyline,null);
 const {TripRoadDistance}=require('../components/linehaul/trip-road-distance.tsx');
 function row(value=trip){hook=0;return renderToStaticMarkup(React.createElement(TripRoadDistance,{trip:value,now}));}
 injected={key,distance:26226.6};assert.ok(row().includes('26,2 km'));assert.ok(row().includes('đến hub'));
 injected={key,distance:0};assert.ok(row().includes('0 km'),'Zero distance remains visible');
 injected={key,distance:26226.6};assert.ok(!row({...trip,lat:10.91}).includes('26,2 km'),'Changed GPS must hide old km');
 injected={key:roadRouteKey(stale),distance:26226.6};assert.ok(row(stale).includes('GPS cũ'));
 assert.ok(row({...trip,hub_lat:null}).includes('Chưa đủ GPS'));
 assert.equal(row({...trip,phase:'departed'}),'');
 injected={key,error:'routing unavailable'};assert.ok(row().includes('Chưa tính được km'));
 console.log('LH map: road km, polyline, loading, stale GPS, trip/GPS changes, missing hub, departed and retry states passed.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
