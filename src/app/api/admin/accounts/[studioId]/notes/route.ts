import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAdminNote, getAdminStudioDetail } from "@/server/admin/service";
import { getAdminApiSession } from "@/server/admin/api";

const createAdminNoteSchema = z.object({
    body: z.string().trim().min(1).max(4000),
    visibility: z.enum(["internal", "finance"]),
});

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

    return NextResponse.json({ notes: detail.notes });
}

export async function POST(request: NextRequest, context: { params: Promise<{ studioId: string }> }) {
    const { session, response } = await getAdminApiSession();
    if (response || !session) {
        return response;
    }

    try {
        const { studioId } = await context.params;
        const payload = createAdminNoteSchema.parse(await request.json());
        await createAdminNote({
            session,
            studioId,
            body: payload.body,
            visibility: payload.visibility,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to create admin note.",
            },
            { status: 400 },
        );
    }
}
