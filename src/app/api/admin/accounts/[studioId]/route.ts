import { NextRequest, NextResponse } from "next/server";

import { getAdminStudioDetail } from "@/server/admin/service";
import { getAdminApiSession } from "@/server/admin/api";

export async function GET(_request: NextRequest, context: { params: Promise<{ studioId: string }> }) {
    const { response } = await getAdminApiSession();
    if (response) {
        return response;
    }

    const { studioId } = await context.params;
    const detail = await getAdminStudioDetail(studioId);
    if (!detail) {
        return NextResponse.json({ message: "Studio not found." }, { status: 404 });
    }

    return NextResponse.json({ detail });
}
