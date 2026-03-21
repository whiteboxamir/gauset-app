import { NextRequest } from "next/server";

import { proxyToBackend } from "@/server/mvp/localProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
    const { path } = await context.params;
    return proxyToBackend(request, `storage/${path.join("/")}`);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
    const { path } = await context.params;
    return proxyToBackend(request, `storage/${path.join("/")}`);
}
