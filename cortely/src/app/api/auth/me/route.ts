import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = getRequestSession(req);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user: session });
}
