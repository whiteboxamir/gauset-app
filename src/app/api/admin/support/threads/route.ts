import { NextResponse } from "next/server";

import { getAdminApiSession } from "@/server/admin/api";
import { getAdminOperationsSnapshot } from "@/server/admin/service";

export async function GET() {
    const { response } = await getAdminApiSession();
    if (response) {
        return response;
    }

    const snapshot = await getAdminOperationsSnapshot();
    return NextResponse.json({ threads: snapshot.supportQueue });
}
