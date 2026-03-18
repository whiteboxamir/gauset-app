import { NextResponse } from "next/server";

import { getAdminOperationsSnapshot } from "@/server/admin/service";
import { getAdminApiSession } from "@/server/admin/api";

export async function GET() {
    const { response } = await getAdminApiSession();
    if (response) {
        return response;
    }

    const snapshot = await getAdminOperationsSnapshot();
    return NextResponse.json({ snapshot });
}
