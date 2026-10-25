import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json({ success: false, error: "Chức năng gán đơn cho rider đã được tắt. Rider đang trả được lấy từ SPX." }, { status: 410 });
}
export async function GET() { return retired(); }
export async function POST() { return retired(); }
export async function DELETE() { return retired(); }
