import fs from "node:fs/promises";
import path from "node:path";
import hostGuard from "./mvp_host_guard.cjs";

const { assertPublicCertificationContext, assertPublicMvpBaseUrl } = hostGuard;

const BASE = assertPublicMvpBaseUrl(
    process.env.GAUSET_MVP_BASE_URL || "https://gauset.com",
    "scripts/build_public_cert_packet.mjs",
);
const STORAGE_BASE = assertPublicMvpBaseUrl(
    process.env.GAUSET_MVP_STORAGE_BASE_URL || BASE,
    "scripts/build_public_cert_packet.mjs storage base",
);
const { artifactDir, runLabel } = assertPublicCertificationContext("scripts/build_public_cert_packet.mjs", {
    requireWriteAck: false,
});

const artifactRoot = path.resolve(artifactDir);
const packetPath = path.join(artifactRoot, "public-certification-packet.md");

async function readJson(filename) {
    const filePath = path.join(artifactRoot, filename);
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
}

function relativeArtifactPath(filename) {
    return path.posix.join(artifactDir.replace(/\\/g, "/"), filename);
}

function formatPassFail(value) {
    return value ? "PASS" : "FAIL";
}

function formatValue(value, fallback = "n/a") {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }
    return String(value);
}

function formatList(items, emptyLine = "- none") {
    if (!Array.isArray(items) || items.length === 0) {
        return `${emptyLine}\n`;
    }

    return `${items.map((item) => `- ${item}`).join("\n")}\n`;
}

const [preflight, summary, hostileAudit, playwrightManifest] = await Promise.all([
    readJson("preflight.json"),
    readJson("certification-summary.json"),
    readJson("hostile-audit-report.json"),
    readJson("playwright-run-manifest.json"),
]);

const screenshotFiles = Array.from(
    new Set(
        (playwrightManifest.waves || []).flatMap((wave) =>
            Array.isArray(wave.screenshots) ? wave.screenshots : [],
        ),
    ),
);

const packet = `# Public Certification Packet

- Run label: \`${runLabel}\`
- Base URL: \`${BASE}\`
- Storage base: \`${STORAGE_BASE}\`
- Packet generated at: \`${new Date().toISOString()}\`
- Certification status: \`${summary.status || (summary.pass ? "passed" : "failed")}\`

## Ordered Steps

| Step | Status | Command |
| --- | --- | --- |
${(summary.steps || [])
    .map((step) => `| ${step.name} | ${step.status} | \`${step.command}\` |`)
    .join("\n")}

## Read-Only Preflight

- \`/mvp\` shell: ${formatPassFail(Boolean(preflight.checks?.mvp_shell?.ok && preflight.checks?.mvp_shell?.title_present))}
- \`/mvp/preview\` shell: ${formatPassFail(
    Boolean(preflight.checks?.preview_shell?.ok && preflight.checks?.preview_shell?.launchpad_present),
)}
- Preview safe-lane copy: ${formatPassFail(Boolean(preflight.checks?.preview_shell?.safe_lane_copy_present))}
- Frontend deployment fingerprint: ${formatValue(preflight.checks?.frontend_deployment?.fingerprint?.build_label)}
- Health API: ${formatPassFail(Boolean(preflight.checks?.health?.ok && preflight.checks?.health?.payload?.status === "ok"))}
- Setup status API: ${formatPassFail(Boolean(preflight.checks?.setup_status?.ok))}
- Recorded preflight failures:
${formatList(preflight.failures)}

## Playwright Certification Waves

${(playwrightManifest.waves || [])
    .map((wave) => {
        const waveLines = [
            `### ${wave.wave_id || wave.title}`,
            `- Title: ${wave.title}`,
            `- Status: ${formatValue(wave.status)}`,
            `- Route: ${formatValue(wave.route)}`,
            `- Scene id: ${formatValue(wave.scene_id)}`,
            `- Version id: ${formatValue(wave.version_id)}`,
            `- Asset id: ${formatValue(wave.asset_id)}`,
            `- Review URL: ${formatValue(wave.review_url)}`,
            `- Exported package: ${formatValue(wave.exported_package)}`,
            `- Screenshots: ${
                Array.isArray(wave.screenshots) && wave.screenshots.length > 0
                    ? wave.screenshots.map((name) => `\`${relativeArtifactPath(name)}\``).join(", ")
                    : "n/a"
            }`,
        ];

        if (Array.isArray(wave.version_ids) && wave.version_ids.length > 0) {
            waveLines.push(`- Version ids: ${wave.version_ids.map((value) => `\`${value}\``).join(", ")}`);
        }
        if (Array.isArray(wave.errors) && wave.errors.length > 0) {
            waveLines.push("- Errors:");
            for (const error of wave.errors) {
                waveLines.push(`  - ${error}`);
            }
        }

        return waveLines.join("\n");
    })
    .join("\n\n")}

## Hostile Audit Summary

- Waves executed: ${formatValue(hostileAudit.summary?.waves)}
- Passed hostile checks: ${formatValue(hostileAudit.summary?.passed_hostile_checks)}
- Failed hostile checks: ${formatValue(hostileAudit.summary?.failed_hostile_checks)}
- Unique splat hashes: ${formatValue(hostileAudit.summary?.unique_splats_sha256)}
- Duplicate splat hashes:
${formatList(
    (hostileAudit.summary?.duplicate_splats_sha256 || []).map(
        (entry) => `${entry.sha256}: ${Array.isArray(entry.waves) ? entry.waves.join(", ") : "n/a"}`,
    ),
)}

## Screenshot Review Targets

${formatList(screenshotFiles.map((filename) => `Review \`${relativeArtifactPath(filename)}\``))}

## Manual Review Checklist

- Confirm the frontend build badge is visible in each screenshot and matches \`/api/mvp/deployment\`.
- Confirm the main \`/mvp\` workspace screenshots do not show the preview-route badge.
- Confirm the \`/mvp/preview\` launchpad screenshot shows the demo lane and, after opening the demo world, the route badge is visible.
- Confirm the review-page screenshot shows the public review shell rather than a blank or fallback state.
- Confirm the hostile audit summary remains at zero failed hostile checks before marking Phase 1 public certification complete.

## Artifact Index

- \`${relativeArtifactPath("preflight.json")}\`
- \`${relativeArtifactPath("certification-summary.json")}\`
- \`${relativeArtifactPath("playwright-run-manifest.json")}\`
- \`${relativeArtifactPath("hostile-audit-report.json")}\`
- \`${relativeArtifactPath("public-certification-packet.md")}\`
`;

await fs.mkdir(artifactRoot, { recursive: true });
await fs.writeFile(packetPath, packet);
console.log(packetPath);
