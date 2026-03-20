"use client";

import React, { createContext, useContext } from "react";

import type { MvpWorkspaceShellController } from "../_hooks/useMvpWorkspaceShellController";

const MvpWorkspaceShellContext = createContext<MvpWorkspaceShellController | null>(null);

export function MvpWorkspaceShellProvider({
    workspace,
    children,
}: {
    workspace: MvpWorkspaceShellController;
    children: React.ReactNode;
}) {
    return <MvpWorkspaceShellContext.Provider value={workspace}>{children}</MvpWorkspaceShellContext.Provider>;
}

export function useMvpWorkspaceShell() {
    const workspace = useContext(MvpWorkspaceShellContext);
    if (!workspace) {
        throw new Error("useMvpWorkspaceShell must be used within an MvpWorkspaceShellProvider.");
    }
    return workspace;
}
