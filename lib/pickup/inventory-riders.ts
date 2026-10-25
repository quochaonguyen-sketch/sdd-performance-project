export type RiderInventoryRow = { area:string;ward:string;zones:string[];rider_name:string;rider_code:string;rider_cot:string;cot1:number;cot2:number;total:number };
export function inventoryRiders(rows:RiderInventoryRow[],area:string,cot:"all"|"cot1"|"cot2",query:string) {
  const map=new Map<string,{id:string;name:string;cot:string;areas:Set<string>;zones:Set<string>;visible:number}>();
  const fold=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[đĐ]/g,"d").toLowerCase();
  for(const row of rows) {
    if(area!=="all"&&row.area!==area)continue;
    if(cot!=="all"&&row.rider_cot.toLowerCase()!==cot)continue;
    const key=`${row.rider_code}:${row.rider_cot}`;
    const value=map.get(key)??{id:row.rider_code,name:row.rider_name,cot:row.rider_cot,areas:new Set<string>(),zones:new Set<string>(),visible:0};
    value.areas.add(row.area);for(const zone of row.zones)value.zones.add(zone);value.visible+=Number(row.total);map.set(key,value);
  }
  return [...map.values()].filter(r=>r.visible>0 && (!query || fold(`${r.name} ${r.id} ${[...r.zones].join(' ')} ${[...r.areas].join(' ')}`).includes(fold(query)))).sort((a,b)=>b.visible-a.visible||a.name.localeCompare(b.name,"vi"));
}
