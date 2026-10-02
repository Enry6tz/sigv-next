import { NextResponse } from "next/server";
import { appSprint, dataProvider } from "@/lib/sprint";

export function GET() {
  return NextResponse.json({ status: "ok", product: "SIGV", sprint: appSprint, provider: dataProvider });
}
