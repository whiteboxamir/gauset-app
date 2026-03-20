"use client";

export interface TeamFlashPayload {
    message?: string | null;
    inviteLink?: string | null;
}

function readTeamFlashStorage(key: string) {
    if (typeof window === "undefined") {
        return null;
    }

    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
        return null;
    }

    window.sessionStorage.removeItem(key);

    try {
        const parsed = JSON.parse(raw) as TeamFlashPayload;
        return {
            message: parsed.message ?? null,
            inviteLink: parsed.inviteLink ?? null,
        } satisfies TeamFlashPayload;
    } catch {
        return null;
    }
}

export function consumeTeamFlash(key: string) {
    return readTeamFlashStorage(key);
}

export function persistTeamFlash(key: string, payload: TeamFlashPayload) {
    if (typeof window === "undefined") {
        return;
    }

    window.sessionStorage.setItem(
        key,
        JSON.stringify({
            message: payload.message ?? null,
            inviteLink: payload.inviteLink ?? null,
        }),
    );
}
