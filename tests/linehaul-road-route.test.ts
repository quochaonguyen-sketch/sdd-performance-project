import test from "node:test";
import assert from "node:assert/strict";
import {parseRoadRoute,roadRouteKey,validPoint} from "../lib/linehaul/road-route.ts";
import type {LinehaulTrip} from "../lib/linehaul/model.ts";

const response=()=>({code:"Ok",routes:[{distance:12500,geometry:{type:"LineString",coordinates:[[106.6,10.9],[106.65,10.8]]}}],waypoints:[{distance:5},{distance:20}]});
test("road distance and GeoJSON coordinates are preserved in Leaflet order",()=>{
 assert.deepEqual(parseRoadRoute(response(),"gps-a"),{key:"gps-a",distanceMeters:12500,points:[[10.9,106.6],[10.8,106.65]]});
 const zero=response();zero.routes[0].distance=0;assert.equal(parseRoadRoute(zero,"at-hub").distanceMeters,0);
});
test("no route, broken geometry and excessive road snapping never become a straight line",()=>{
 for(const body of [null,{}, {...response(),code:"NoRoute"},{...response(),routes:[]},
  {...response(),waypoints:[{distance:1001},{distance:0}]},
  {...response(),waypoints:[]},
  {...response(),routes:[{distance:NaN,geometry:response().routes[0].geometry}]},
  {...response(),routes:[{distance:100,geometry:{type:"LineString",coordinates:[[106,91],[106,10]]}}]},
  {...response(),routes:[{distance:100,geometry:{type:"LineString",coordinates:[[106,10]]}}]},
 ])assert.throws(()=>parseRoadRoute(body,"gps"));
});
test("coordinates must be finite numbers and GPS updates invalidate route identity",()=>{
 for(const [lat,lng] of [[null,106],[10,undefined],[NaN,106],[10,Infinity],[91,106],[10,181],[0,0],["10",106]])assert.equal(validPoint(lat,lng),false);
 assert.equal(validPoint(10.8,106.6),true);
 const trip={trip_id:"123",lat:10.8,lng:106.6,hub_lat:10.7,hub_lng:106.7,gps_at:"a"} as LinehaulTrip;
 for(const changed of [{gps_at:"b"},{lat:10.9},{hub_lng:106.8},{trip_id:"456"}])assert.notEqual(roadRouteKey(trip),roadRouteKey({...trip,...changed}));
});
