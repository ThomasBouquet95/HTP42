import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST() {
  await endSession();
  return NextResponse.redirect(`${env.appUrl}/login`, { status: 303 });
}
