import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriverPerformance,getDriverPerformanceExport, parsePerformanceFilters } from "@/lib/performance/driver-performance";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const filters = parsePerformanceFilters(new URL(request.url).searchParams);
    if(new URL(request.url).searchParams.get("export")==="xlsx"){
      const result=await getDriverPerformanceExport(filters);
      const {performanceListWorkbook}=await import("@/lib/performance/list-export");
      const XLSX=await import("xlsx");
      const buffer=XLSX.write(performanceListWorkbook(filters,result.rows),{type:"buffer",bookType:"xlsx",compression:true});
      return new Response(new Uint8Array(buffer),{headers:{"Cache-Control":"private, no-store","Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="rider-performance-${filters.start}-${filters.end}.xlsx"`}});
    }
    const result = await getDriverPerformance(filters, new URL(request.url).searchParams.get("_r")??"");
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
