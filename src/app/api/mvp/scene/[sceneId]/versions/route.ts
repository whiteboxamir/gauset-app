import { NextRequest } from "next/server";

import { proxyToBackend } from "@/server/mvp/localProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ sceneId: string }> }) {
    const { sceneId } = await context.params;
    return proxyToBackend(request, `scene/${sceneId}/versions`);
}
