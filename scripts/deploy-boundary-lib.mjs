import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const GAUSET_APP_PROJECT = {
    id: "prj_ZIWyr5xwYv9NOaskMNjZ6TcM4cyF",
    name: "gauset-app",
};

export const GAUSET_COM_PROJECT = {
    id: "prj_jF72OcZYvOt9x2LwUaKEJp1mjPAY",
    name: "gauset-com",
};

export const EXPECTED_GITHUB_REPO = {
    owner: "whiteboxamir",
    name: "gauset-app",
    slug: "whiteboxamir/gauset-app",
};

export const BLOCKED_PRODUCTION_HOSTS = new Set([
    "gnosika.com",
    "www.gnosika.com",
]);

export function normalizeHost(value) {
    if (!value) {
        return "";
    }

    return value
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .trim()
        .toLowerCase();
}

export function normalizeRepoSlug(value) {
    if (!value) {
        return "";
    }

    return value
        .trim()
        .replace(/^git@github\.com:/, "")
        .replace(/^https?:\/\/github\.com\//, "")
        .replace(/^ssh:\/\/git@github\.com\//, "")
        .replace(/\.git$/, "")
        .replace(/^\/+/, "")
        .toLowerCase();
}

export function readLinkedProject(cwd = process.cwd()) {
    const projectPath = path.join(cwd, ".vercel", "project.json");
    if (!fs.existsSync(projectPath)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(projectPath, "utf8"));
}

export function readOriginRemote(cwd = process.cwd()) {
    const result = spawnSync("git", ["config", "--get", "remote.origin.url"], {
        cwd,
        encoding: "utf8",
    });

    if (result.status !== 0) {
        return "";
    }

    return result.stdout.trim();
}

export function buildBoundarySnapshot(cwd = process.cwd(), env = process.env) {
    const linkedProject = readLinkedProject(cwd);
    const originRemote = readOriginRemote(cwd);
    const projectProductionUrl = normalizeHost(env.VERCEL_PROJECT_PRODUCTION_URL);
    const deploymentUrl = normalizeHost(env.VERCEL_URL);
    const repoOwner = (env.VERCEL_GIT_REPO_OWNER?.trim() ?? "").toLowerCase();
    const repoName = (env.VERCEL_GIT_REPO_SLUG?.trim() ?? "").toLowerCase();

    return {
        cwd,
        runningOnVercel: env.VERCEL === "1",
        gitCommitSha: env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "",
        originRemote,
        originRepoSlug: normalizeRepoSlug(originRemote),
        linkedProject,
        projectProductionUrl,
        deploymentUrl,
        detectedProjectId: env.VERCEL_PROJECT_ID?.trim() ?? "",
        vercelRepoOwner: repoOwner,
        vercelRepoName: repoName,
        vercelRepoSlug: repoOwner && repoName ? `${repoOwner}/${repoName}` : repoName,
    };
}

export function evaluateBoundary(snapshot) {
    const failures = [];

    if (snapshot.runningOnVercel && (!snapshot.gitCommitSha || !snapshot.vercelRepoName)) {
        failures.push({
            message: "Direct Vercel CLI deployments are disabled for gauset-app.",
            details: [
                "This Vercel build is missing Git metadata, so it was not triggered from the GitHub integration.",
                "Push the branch to GitHub and let Vercel deploy from the connected repository.",
            ],
        });
    }

    if (snapshot.runningOnVercel && snapshot.vercelRepoOwner && snapshot.vercelRepoOwner !== EXPECTED_GITHUB_REPO.owner) {
        failures.push({
            message: "This build is using the wrong GitHub owner for gauset-app.",
            details: [
                `Expected owner: ${EXPECTED_GITHUB_REPO.owner}`,
                `Actual owner: ${snapshot.vercelRepoOwner}`,
            ],
        });
    }

    if (snapshot.runningOnVercel && snapshot.vercelRepoName && snapshot.vercelRepoName !== EXPECTED_GITHUB_REPO.name) {
        failures.push({
            message: "This build is using the wrong GitHub repository for gauset-app.",
            details: [
                `Expected repo: ${EXPECTED_GITHUB_REPO.name}`,
                `Actual repo: ${snapshot.vercelRepoName}`,
            ],
        });
    }

    if (snapshot.originRepoSlug && snapshot.originRepoSlug !== EXPECTED_GITHUB_REPO.slug) {
        failures.push({
            message: "This checkout points at the wrong GitHub remote.",
            details: [
                `Expected remote: ${EXPECTED_GITHUB_REPO.slug}`,
                `Actual remote: ${snapshot.originRepoSlug}`,
            ],
        });
    }

    if (snapshot.linkedProject) {
        const linkedName = snapshot.linkedProject.projectName ?? "";
        const linkedId = snapshot.linkedProject.projectId ?? "";

        if (linkedName === GAUSET_COM_PROJECT.name || linkedId === GAUSET_COM_PROJECT.id) {
            failures.push({
                message: "This gauset-app checkout is linked to the gauset-com Vercel project.",
                details: [
                    "Production site deploys must come from /Users/amirboz/gauset, not /Users/amirboz/gauset-app.",
                    "Relink this directory to gauset-app before attempting a deploy.",
                ],
            });
        }

        if (linkedName && linkedName !== GAUSET_APP_PROJECT.name) {
            failures.push({
                message: "This gauset-app checkout is linked to an unexpected Vercel project.",
                details: [
                    `Expected project: ${GAUSET_APP_PROJECT.name}`,
                    `Actual project: ${linkedName}`,
                ],
            });
        }

        if (linkedId && linkedId !== GAUSET_APP_PROJECT.id) {
            failures.push({
                message: "This gauset-app checkout is linked to an unexpected Vercel project id.",
                details: [
                    `Expected project id: ${GAUSET_APP_PROJECT.id}`,
                    `Actual project id: ${linkedId}`,
                ],
            });
        }
    }

    const blockedHost = [snapshot.projectProductionUrl, snapshot.deploymentUrl].find((host) => BLOCKED_PRODUCTION_HOSTS.has(host));
    if (blockedHost) {
        failures.push({
            message: "Refusing to build gauset-app for the blocked gnosika production domain.",
            details: [
                `Blocked host: ${blockedHost}`,
                "gnosika.com must only be built from its dedicated production checkout.",
            ],
        });
    }

    if (snapshot.detectedProjectId === GAUSET_COM_PROJECT.id) {
        failures.push({
            message: "Refusing to build gauset-app inside the gauset-com Vercel project.",
            details: ["Use /Users/amirboz/gauset for gauset-com production deployments."],
        });
    }

    return failures;
}
