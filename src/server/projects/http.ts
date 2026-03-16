import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const operatorEmailSchema = z.string().trim().email();

export function requireOperatorEmail(request: NextRequest) {
    const candidate = request.cookies.get("auth-token")?.value;
    const parsed = operatorEmailSchema.safeParse(candidate);

    if (!parsed.success) {
        throw new Error("Login required.");
    }

    return parsed.data.toLowerCase();
}

function resolveRouteErrorStatus(message: string) {
    if (message === "Login required.") {
        return 401;
    }
    if (message.includes("not found")) {
        return 404;
    }
    if (message.includes("access denied") || message.includes("owned by another operator")) {
        return 403;
    }
    if (message.includes("already linked") || message.includes("already exists") || message.includes("cannot be reopened")) {
        return 409;
    }
    return 400;
}

export function respondWithRouteError(error: unknown, fallback = "Request failed.") {
    const message = error instanceof Error ? error.message : fallback;
    return NextResponse.json(
        {
            message,
        },
        {
            status: resolveRouteErrorStatus(message),
        },
    );
}
