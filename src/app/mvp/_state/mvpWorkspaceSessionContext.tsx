"use client";

import React, { createContext, useContext } from "react";

import type { MvpWorkspaceSessionController } from "../_hooks/useMvpWorkspaceSessionController";

const MvpWorkspaceSessionContext = createContext<MvpWorkspaceSessionController | null>(null);

export function MvpWorkspaceSessionProvider({
    session,
    children,
}: {
    session: MvpWorkspaceSessionController;
    children: React.ReactNode;
}) {
    return <MvpWorkspaceSessionContext.Provider value={session}>{children}</MvpWorkspaceSessionContext.Provider>;
}

export function useMvpWorkspaceSession() {
    const session = useContext(MvpWorkspaceSessionContext);
    if (!session) {
        throw new Error("useMvpWorkspaceSession must be used within an MvpWorkspaceSessionProvider.");
    }
    return session;
}
