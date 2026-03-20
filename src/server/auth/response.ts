import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type AuthActionCode =
    | "ok"
    | "validation_error"
    | "auth_unavailable"
    | "database_unavailable"
    | "launch_access_required"
    | "registration_required"
    | "invite_not_found"
    | "invite_inactive"
    | "auth_required"
    | "account_restricted"
    | "session_missing_email"
    | "provider_unavailable"
    | "session_unavailable"
    | "unknown_error";

export type AuthNextStep = "login" | "register" | "accept_invite" | "request_access";

export interface AuthActionData {
    email?: string;
    nextStep?: AuthNextStep;
    suggestedPath?: string;
    studioId?: string;
    studioName?: string;
    role?: string;
}

export interface AuthActionResponse<TData extends AuthActionData | undefined = undefined> {
    success: boolean;
    code: AuthActionCode;
    message: string;
    data?: TData;
}

export class AuthRouteError<TData extends AuthActionData | undefined = undefined> extends Error {
    status: number;
    code: AuthActionCode;
    data?: TData;

    constructor({
        message,
        status,
        code,
        data,
    }: {
        message: string;
        status: number;
        code: AuthActionCode;
        data?: TData;
    }) {
        super(message);
        this.name = "AuthRouteError";
        this.status = status;
        this.code = code;
        this.data = data;
    }
}

export function createAuthRouteError<TData extends AuthActionData | undefined = undefined>(input: {
    message: string;
    status: number;
    code: AuthActionCode;
    data?: TData;
}) {
    return new AuthRouteError(input);
}

export function authSuccess<TData extends AuthActionData | undefined = undefined>({
    message,
    status = 200,
    code = "ok",
    data,
}: {
    message: string;
    status?: number;
    code?: AuthActionCode;
    data?: TData;
}) {
    const body: AuthActionResponse<TData> = {
        success: true,
        code,
        message,
    };

    if (data !== undefined) {
        body.data = data;
    }

    return NextResponse.json(body, { status });
}

function resolveKnownAuthError(error: Error) {
    if (/Supabase auth is not configured|Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY/i.test(error.message)) {
        return createAuthRouteError({
            code: "auth_unavailable",
            status: 503,
            message:
                "Identity is implemented here, but this shell is missing the Supabase auth env needed to issue or validate links.",
        });
    }

    if (/Platform database is not configured|SUPABASE_SERVICE_ROLE_KEY is required|REST-backed services/i.test(error.message)) {
        return createAuthRouteError({
            code: "database_unavailable",
            status: 503,
            message:
                "Invite-first auth depends on the platform database env. This shell cannot verify launch access or finalize studio invites yet.",
        });
    }

    return null;
}

function normalizeAuthRouteError(
    error: unknown,
    fallback: {
        message: string;
        status?: number;
        code?: AuthActionCode;
    },
) {
    if (error instanceof AuthRouteError) {
        return error;
    }

    if (error instanceof ZodError) {
        return createAuthRouteError({
            code: "validation_error",
            status: 400,
            message: "Request did not match the expected auth payload.",
        });
    }

    if (error instanceof Error) {
        const known = resolveKnownAuthError(error);
        if (known) {
            return known;
        }

        return createAuthRouteError({
            code: fallback.code ?? "unknown_error",
            status: fallback.status ?? 400,
            message: error.message || fallback.message,
        });
    }

    return createAuthRouteError({
        code: fallback.code ?? "unknown_error",
        status: fallback.status ?? 400,
        message: fallback.message,
    });
}

export function authFailure(
    error: unknown,
    fallback: {
        message: string;
        status?: number;
        code?: AuthActionCode;
    },
) {
    const normalized = normalizeAuthRouteError(error, fallback);
    const body: AuthActionResponse<AuthActionData> = {
        success: false,
        code: normalized.code,
        message: normalized.message,
    };

    if (normalized.data !== undefined) {
        body.data = normalized.data;
    }

    return NextResponse.json(body, {
        status: normalized.status,
    });
}
