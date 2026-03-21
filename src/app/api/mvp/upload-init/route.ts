import { NextResponse } from "next/server";

import { resolveDirectUploadCapability } from "@/server/mvp/localConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json(resolveDirectUploadCapability());
}
