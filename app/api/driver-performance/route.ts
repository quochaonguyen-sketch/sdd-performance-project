import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriverPerformance,getDriverPerformanceExport, parsePerformanceFilters } from "@/lib/performance/driver-performance";
import { TtlCache } from "@/lib/cache/ttl-cache";
const dashboardCache = new TtlCache<Awaited<ReturnType<typeof getDriverPerformance>>>(300_000, 24);

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params=new URL(request.url).searchParams;
    const filters = parsePerformanceFilters(params);
    if(params.get("export")==="xlsx"){
      const mode=params.get("exportMode")??"summary";
      if(!["summary","daily","both"].includes(mode))throw new RangeError("Chọn kiểu xuất tổng hợp, theo ngày hoặc cả hai.");
      const [summary,daily]=await Promise.all([
        mode!=="daily"?getDriverPerformanceExport(filters):null,
        mode!=="summary"?getDriverPerformanceExport(filters,"daily"):null,
      ]);
      const {performanceListWorkbook}=await import("@/lib/performance/list-export");
      const XLSX=await import("xlsx");
      const workbook=summary?performanceListWorkbook(filters,summary.rows):performanceListWorkbook(filters,daily!.rows,"daily");
      if(summary&&daily){
        const details=performanceListWorkbook(filters,daily.rows,"daily");
        XLSX.utils.book_append_sheet(workbook,details.Sheets["Theo ngay"],"Theo ngay");
      }
      const buffer=XLSX.write(workbook,{type:"buffer",bookType:"xlsx",compression:true});
      return new Response(new Uint8Array(buffer),{headers:{"Cache-Control":"private, no-store","Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="rider-performance-${mode}-${filters.start}-${filters.end}.xlsx"`}});
    }
    if (params.get("dashboard") === "1") {
      const key = JSON.stringify([user.id, filters]);
      const force = request.headers.get("x-dashboard-refresh") === "1";
      if (force) dashboardCache.delete(key);
      const cached = await dashboardCache.load(key, () => getDriverPerformance(filters, force ? String(Date.now()) : ""));
      return NextResponse.json({success:true,...cached.value},{headers:{"Cache-Control":"private, no-store", "X-Data-Cache": cached.hit ? "HIT" : "MISS", "X-Cache-Expires": String(cached.expiresAt)}});
    }
    const result = await getDriverPerformance(filters, params.get("_r")??"");
    return NextResponse.json({ success: true, ...result },{headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Không thể tải dữ liệu performance",
      },
      { status: error instanceof RangeError ? 400 : 500 },
    );
  }
}
