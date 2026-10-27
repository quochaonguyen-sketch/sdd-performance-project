"use client";
import { useState } from "react";
import { FilterMemoryProvider, useRememberedState } from "@/components/layout/filter-memory";
import { ProductUpdatesProvider } from "@/components/feedback/use-product-updates";
import { ProductUpdateNotifications } from "@/components/feedback/product-update-notifications";
import { FeedbackView } from "@/components/feedback/feedback-view";
import { SiteHealthView } from "@/components/settings/site-health-view";
function Filters() {
  const [area,setArea]=useRememberedState('preview:area','all'), [date,setDate]=useRememberedState('preview:date','2026-10-27'), [status,setStatus]=useRememberedState('preview:status','all');
  return <section><label>Fixture area<select value={area} onChange={e=>setArea(e.target.value)}><option value="all">all</option><option value="KV1">KV1</option></select></label><label>Fixture date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Fixture status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">all</option><option value="OPEN">OPEN</option></select></label></section>;
}
export default function Preview() {
  const [user,setUser]=useState('A'),[view,setView]=useState('filters');
  return <div style={{padding:24}}><button onClick={()=>setUser(user==='A'?'B':'A')}>Switch account</button><button onClick={()=>setView(view==='filters'?'other':'filters')}>Switch view</button><button onClick={()=>setView('metrics')}>Show metrics</button><FilterMemoryProvider key={user} userId={'fixture-'+user}>{view==='filters'?<Filters/>:null}{view==='metrics'?<SiteHealthView/>:<ProductUpdatesProvider><ProductUpdateNotifications/><FeedbackView/></ProductUpdatesProvider>}</FilterMemoryProvider></div>;
}
