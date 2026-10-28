export const DATA_SOURCES = [
  { id:"linehaul", name:"Quản lý LH", description:"Chuyến hôm nay, xuất/xả tải và vị trí xe", href:"/linehaul", permission:"manage_dashboard", color:"#0f766e", dated:false, interval:300 },
  { id:"delivery_realtime", name:"Delivery Realtime", description:"Tiến độ giao hàng, đơn đang giao và cảnh báo rider", href:"/realtime-dashboard", permission:"manage_performance", color:"#2563eb", dated:false, interval:600 },
  { id:"onhold_daily", name:"OH Delivery", description:"Thu thập OH lũy kế · khử trùng mã trong ngày · chốt pivot cuối ngày", href:"/onhold", permission:"manage_performance", color:"#ea580c", dated:false, interval:300 },
  { id:"pickup_inventory", name:"Tồn Pickup", description:"Assigned thực sự, chưa Onhold/Picked", href:"/lmhub-inventory", permission:"manage_pickup", color:"#059669", dated:false, interval:1800 },
  { id:"delivery_inventory", name:"Tồn Delivery", description:"Đơn còn tại hub theo khu vực và tuyến", href:"/inventory-delivery", permission:"manage_pickup", color:"#2563eb", dated:false, interval:1800 },
  { id:"pickup_realtime", name:"Pickup Realtime", description:"Sản lượng, chờ lấy và Onhold của rider", href:"/pickup-realtime", permission:"manage_pickup", color:"#7c3aed", dated:false, interval:300 },
  { id:"pickup_volume", name:"Sản lượng Pickup", description:"Đồng bộ sản lượng theo ngày", href:"/volume/pickup", permission:"manage_volume", color:"#0891b2", dated:true, interval:1800 },
  { id:"delivery_volume", name:"Sản lượng Delivery", description:"Đồng bộ sản lượng theo ngày", href:"/volume/delivery", permission:"manage_volume", color:"#d97706", dated:true, interval:1800 },
  { id:"performance", name:"Performance", description:"Hiệu suất rider theo ngày", href:"/performance", permission:"manage_performance", color:"#db2777", dated:true, interval:1800 },
  { id:"return_inventory", name:"Hàng trả", description:"Chờ trả tại hub và đang đi trả · KV1–KV5", href:"/return-orders", permission:"manage_return", color:"#e11d48", dated:false, interval:1800 },
] as const;
export type DataSourceId = typeof DATA_SOURCES[number]["id"];
export function dataSource(id: unknown) { return DATA_SOURCES.find(s=>s.id===id); }
export function canControlSources(role:string) { return role==="admin"||role==="leader"; }
export function canViewSource(role:string,permissions:Record<string,boolean>,id:unknown){
 const source=dataSource(id);return !!source&&(["admin","member","leader"].includes(role)||permissions[source.permission]===true);
}
export function sourceAllowed(role:string, permissions:Record<string,boolean>, id:unknown) {
  const source=dataSource(id);
  return !!source&&canControlSources(role)&&(role==="admin"||permissions[source.permission]===true);
}
export function vietnamDay() { return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date()); }
export function sourceAction(value:unknown, today=vietnamDay()) {
  if(!value||typeof value!=="object")throw new Error("Yêu cầu không hợp lệ");
  const body=value as Record<string,unknown>,source=dataSource(body.source);
  if(!source||typeof body.action!=="string"||!["run","stop","auto"].includes(body.action))throw new Error("Nguồn hoặc lệnh không hợp lệ");
  const day=String(body.day??today);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day||day>today||Date.parse(today)-Date.parse(day)>366*86400000)throw new Error("Ngày chạy phải hợp lệ, không ở tương lai và trong 366 ngày gần nhất");
  const interval=Number(body.interval??source.interval);
  if(body.action==="auto"&&(typeof body.enabled!=="boolean"||!Number.isInteger(interval)||interval<300||interval>86400))throw new Error("Chu kỳ tự động từ 5 phút đến 24 giờ");
  const mode=body.mode??"interval",scheduleTime=body.time??"06:00",offset=body.offset??0;
  if(body.action==="auto"&&(typeof mode!=="string"||!["interval","daily"].includes(mode)||typeof scheduleTime!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleTime)||!Number.isInteger(offset)||![0,1].includes(offset as number)||(!source.dated&&offset!==0)))throw new Error("Chọn lịch hợp lệ, giờ HH:mm và ngày hiện tại hoặc hôm trước");
  const start=body.start??null,end=body.end??null;
  if(body.action==="auto"&&[start,end].some(v=>v!==null&&(typeof v!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))))throw new Error("Khung giờ bắt đầu/kết thúc phải có dạng HH:mm");
  return { source:source.id,action:body.action as "run"|"stop"|"auto",day:source.dated?day:today,enabled:body.enabled===true,interval,mode:mode as "interval"|"daily",time:scheduleTime as string,offset:offset as number,start:start as string|null,end:end as string|null };
}
