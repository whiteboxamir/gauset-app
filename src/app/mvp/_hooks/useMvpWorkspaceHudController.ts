"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
    createDefaultHudState,
    hudStorageKey,
    normalizeHudState,
    type WorkspaceHudState,
    type WorkspaceRouteVariant,
} from "./mvpWorkspaceSessionShared";

interface UseMvpWorkspaceHudControllerOptions {
    routeVariant?: WorkspaceRouteVariant;
}

export function useMvpWorkspaceHudController({
    routeVariant = "workspace",
}: UseMvpWorkspaceHudControllerOptions) {
    const [hudState, setHudState] = useState<WorkspaceHudState>(() => createDefaultHudState(routeVariant));
    const hudHydratedRef = useRef(false);

    useEffect(() => {
        try {
            const rawHudState = window.localStorage.getItem(hudStorageKey(routeVariant));
            if (!rawHudState) {
                setHudState(createDefaultHudState(routeVariant));
                return;
            }
            setHudState(normalizeHudState(routeVariant, JSON.parse(rawHudState)));
        } catch {
            setHudState(createDefaultHudState(routeVariant));
        } finally {
            hudHydratedRef.current = true;
        }
    }, [routeVariant]);

    useEffect(() => {
        if (!hudHydratedRef.current) {
            return;
        }
        try {
            window.localStorage.setItem(hudStorageKey(routeVariant), JSON.stringify(hudState));
        } catch {
            // Ignore local storage failures so the workspace stays usable.
        }
    }, [hudState, routeVariant]);

    const toggleLeftRail = useCallback(() => {
        setHudState((previous) => ({
            ...previous,
            leftRailCollapsed: !previous.leftRailCollapsed,
        }));
    }, []);

    const toggleRightRail = useCallback(() => {
        setHudState((previous) => ({
            ...previous,
            rightRailCollapsed: !previous.rightRailCollapsed,
        }));
    }, []);

    const toggleDirectorHud = useCallback(() => {
        setHudState((previous) => ({
            ...previous,
            directorHudCompact: !previous.directorHudCompact,
        }));
    }, []);

    const toggleAdvancedMode = useCallback(() => {
        setHudState((previous) => ({
            ...previous,
            advancedMode: !previous.advancedMode,
        }));
    }, []);

    return {
        hudState,
        toggleLeftRail,
        toggleRightRail,
        toggleDirectorHud,
        toggleAdvancedMode,
    };
}
