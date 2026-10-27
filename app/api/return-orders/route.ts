import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canManageReturn } from "@/lib/auth/permissions";
import { getReturnWorkspace } from "@/lib/return-orders/workspace-server";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({success:false,error:"Chưa đăng nhập"},{status:401});
  if (!canManageReturn(context.profile.role,context.profile.permissions)) return NextResponse.json({success:false,error:"Không có quyền xem hàng trả"},{status:403});
  try {
    const data=await getReturnWorkspace();
    const etag=data.snapshotAt?JSON.stringify(data.snapshotAt):null;
    const headers:Record<string,string>={"Cache-Control":"private, no-store"};
    if(etag)headers.ETag=etag;
    if(etag&&request.headers.get("If-None-Match")===etag)return new Response(null,{status:304,headers});
    return NextResponse.json({success:true,...data},{headers});
  }
  catch { return NextResponse.json({success:false,error:"Không tải được dữ liệu hàng trả. Thử làm mới sau vài giây."},{status:503}); }
}
