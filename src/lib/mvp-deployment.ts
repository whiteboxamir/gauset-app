export interface MvpDeploymentFingerprint {
    build_label: string;
    commit_ref: string;
    commit_sha: string;
    commit_short: string;
    deployment_host: string;
    deployment_id: string;
    runtime_target: string;
    vercel_env: string;
}

function normalizeHost(value?: string | null) {
    return String(value || "")
        .trim()
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
}

function shortenSha(value?: string | null) {
    const sha = String(value || "").trim();
    return sha ? sha.slice(0, 7) : "no-sha";
}

export function getMvpDeploymentFingerprint(): MvpDeploymentFingerprint {
    const commitSha =
        process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
        process.env.GIT_COMMIT_SHA?.trim() ||
        process.env.NEXT_PUBLIC_GIT_COMMIT_SHA?.trim() ||
        "";
    const commitRef =
        process.env.VERCEL_GIT_COMMIT_REF?.trim() ||
        process.env.GIT_BRANCH?.trim() ||
        process.env.NEXT_PUBLIC_GIT_COMMIT_REF?.trim() ||
        "";
    const vercelEnv = process.env.VERCEL_ENV?.trim() || "";
    const deploymentHost =
        normalizeHost(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
        normalizeHost(process.env.VERCEL_URL) ||
        normalizeHost(process.env.NEXT_PUBLIC_VERCEL_URL) ||
        normalizeHost(process.env.NEXT_PUBLIC_GAUSET_APP_HOST) ||
        "local";
    const deploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim() || "";
    const runtimeTarget =
        process.env.VERCEL === "1"
            ? "vercel"
            : process.env.NODE_ENV === "production"
              ? "local-production"
              : "local-development";
    const commitShort = shortenSha(commitSha);
    const buildLabel = [deploymentHost, vercelEnv || runtimeTarget, commitShort].filter(Boolean).join(" · ");

    return {
        build_label: buildLabel,
        commit_ref: commitRef,
        commit_sha: commitSha,
        commit_short: commitShort,
        deployment_host: deploymentHost,
        deployment_id: deploymentId,
        runtime_target: runtimeTarget,
        vercel_env: vercelEnv,
    };
}
