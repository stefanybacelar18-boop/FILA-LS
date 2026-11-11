import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getLiveSession(req);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user: session });
}
