"use client";

import { usePathname } from "next/navigation";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

type ShellRouteOverrides = {
    eyebrow?: string;
    title: string;
    subtitle?: string;
};

type ShellRoutePresentation = {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    summary: string;
    routeBadge: string;
    routeTone: StatusTone;
    projectBadge: string | null;
    sidebarTitle: string;
    sidebarSummary: string;
};

function extractProjectBadge(pathname: string | null) {
    if (!pathname) {
        return null;
    }
    if (/^\/app\/worlds\/[^/]+/.test(pathname)) {
        return "Project record open";
    }
    if (pathname === "/app/worlds") {
        return "Project record flow";
    }
    return null;
}

function resolveShellRoutePresentation(pathname: string | null, overrides: ShellRouteOverrides): ShellRoutePresentation {
    const projectBadge = extractProjectBadge(pathname);

    if (!pathname || pathname === "/app/worlds") {
        return {
            eyebrow: overrides.eyebrow ?? "Persistent world system of record",
            title: "World record library",
            subtitle:
                overrides.subtitle ??
                "Open a project record, choose one source path, and keep the same world attached through save, reopen, review, and handoff.",
            summary: "Project-bound saved worlds, continuity memory, review, and handoff.",
            routeBadge: "Library route",
            routeTone: "info",
            projectBadge,
            sidebarTitle: "World Record Library",
            sidebarSummary: "Build one world. Save it once. Then direct it.",
        };
    }

    if (/^\/app\/worlds\/[^/]+/.test(pathname)) {
        return {
            eyebrow: "Persistent world system of record",
            title: "Project record",
            subtitle:
                overrides.subtitle ??
                "This project record owns the saved-world path, continuity memory, review posture, and handoff truth for one filmmaking world.",
            summary: "Current route keeps one persistent world attached to this project record.",
            routeBadge: "Project route",
            routeTone: "success",
            projectBadge,
            sidebarTitle: "Project Record",
            sidebarSummary: "This route anchors source path, first save, reopen, review, and handoff to one durable world record.",
        };
    }

    if (pathname.startsWith("/app/dashboard")) {
        return {
            eyebrow: "Operating lane",
            title: "Operations support",
            subtitle: overrides.subtitle ?? "Operational follow-through supports the world-record workflow instead of replacing the product front door.",
            summary: "This is a support lane around the persistent world system of record.",
            routeBadge: "Support lane",
            routeTone: "warning",
            projectBadge,
            sidebarTitle: "World Record Library",
            sidebarSummary: "Operations stays secondary to the product surface where projects and saved worlds actually live.",
        };
    }

    if (pathname.startsWith("/app/billing")) {
        return {
            eyebrow: "Operating lane",
            title: "Billing support",
            subtitle: overrides.subtitle ?? "Billing controls access around project records and saved worlds without becoming the product story itself.",
            summary: "Billing governs access around the world-record workflow.",
            routeBadge: "Support lane",
            routeTone: "warning",
            projectBadge,
            sidebarTitle: "World Record Library",
            sidebarSummary: "Billing supports the studio layer wrapped around persistent world records.",
        };
    }

    if (pathname.startsWith("/app/team")) {
        return {
            eyebrow: "Studio lane",
            title: "Studio team",
            subtitle: overrides.subtitle ?? "Team access controls who can operate on project records, saved worlds, review, and handoff.",
            summary: "Membership and roles sit behind the saved-world workflow.",
            routeBadge: "Studio lane",
            routeTone: "info",
            projectBadge,
            sidebarTitle: "World Record Library",
            sidebarSummary: "Team controls stay in service of the project-bound world system of record.",
        };
    }

    if (pathname.startsWith("/app/support")) {
        return {
            eyebrow: "Operating lane",
            title: "Support",
            subtitle: overrides.subtitle ?? "Support remains a secondary service lane behind the persistent world product.",
            summary: "Support stays outside the primary saved-world workflow.",
            routeBadge: "Support lane",
            routeTone: "warning",
            projectBadge,
            sidebarTitle: "World Record Library",
            sidebarSummary: "Support is a secondary lane, not the narrative front door to the product.",
        };
    }

    if (pathname.startsWith("/app/settings/security")) {
        return {
            eyebrow: "Account lane",
            title: "Security settings",
            subtitle: overrides.subtitle ?? "Session and device controls protect studio access around project-bound world records.",
            summary: "Security protects the persistent world system of record.",
            routeBadge: "Account lane",
            routeTone: "neutral",
            projectBadge,
            sidebarTitle: "World Record Library",
            sidebarSummary: "Account and security controls wrap the same project-bound saved-world workflow.",
        };
    }

    if (pathname.startsWith("/app/settings")) {
        return {
            eyebrow: "Account lane",
            title: "Account settings",
            subtitle: overrides.subtitle ?? "Account configuration remains secondary to the product surface where world records actually live.",
            summary: "Settings wrap the world-record workflow rather than replacing it.",
            routeBadge: "Account lane",
            routeTone: "neutral",
            projectBadge,
            sidebarTitle: "World Record Library",
            sidebarSummary: "Settings stay in service of the saved-world system of record.",
        };
    }

    return {
        eyebrow: overrides.eyebrow,
        title: overrides.title,
        subtitle: overrides.subtitle,
        summary: "Project-bound saved worlds, continuity memory, review, and handoff.",
        routeBadge: "Current route",
        routeTone: "neutral",
        projectBadge,
        sidebarTitle: "World Record Library",
        sidebarSummary: "Build one world. Save it once. Then direct it.",
    };
}

export function useShellRouteContext(overrides: ShellRouteOverrides) {
    const pathname = usePathname();
    return {
        pathname,
        route: resolveShellRoutePresentation(pathname, overrides),
    };
}

export function isShellNavItemActive(pathname: string | null, href: string) {
    if (!pathname) {
        return false;
    }
    if (href === "/app/worlds") {
        return pathname === href || pathname.startsWith("/app/worlds/");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}
