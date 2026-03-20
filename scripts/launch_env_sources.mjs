import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_ENV_FILES = [
    path.resolve(".vercel/.env.production.local"),
    "/tmp/gauset-app.launch.env",
    "/tmp/gauset-app.vercel.env",
    "/tmp/gauset-app.preview.env",
    "/tmp/gauset-app.development.env",
    path.resolve("../gauset/.env.local"),
    "/Users/amirboz/Downloads/1. Projects/gauset/.env.local",
];

export const launchEnvProfiles = {
    platform: [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "NEXT_PUBLIC_APP_URL",
        "NEXT_PUBLIC_SITE_URL",
        "GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL",
        "GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD",
        "GAUSET_PLATFORM_E2E_OWNER_EMAIL",
        "GAUSET_PLATFORM_E2E_OWNER_PASSWORD",
        "GAUSET_PLATFORM_E2E_STORAGE_STATE",
        "SUPABASE_MANAGEMENT_ACCESS_TOKEN",
        "SUPABASE_PROJECT_REF",
        "GAUSET_PLATFORM_BASE_URL",
        "GAUSET_PLATFORM_E2E_BASE_URL",
    ],
    billing: [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "SUPABASE_MANAGEMENT_ACCESS_TOKEN",
        "SUPABASE_PROJECT_REF",
        "NEXT_PUBLIC_APP_URL",
        "NEXT_PUBLIC_SITE_URL",
        "GAUSET_PLATFORM_BASE_URL",
        "GAUSET_PLATFORM_E2E_BASE_URL",
        "GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL",
        "GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD",
        "GAUSET_PLATFORM_E2E_OWNER_EMAIL",
        "GAUSET_PLATFORM_E2E_OWNER_PASSWORD",
    ],
};

function parseEnvValue(rawValue) {
    const trimmed = rawValue.trim();
    if (
        (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function parseEnvFile(text) {
    const entries = {};
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const normalized = line.startsWith("export ") ? line.slice("export ".length) : line;
        const separator = normalized.indexOf("=");
        if (separator <= 0) {
            continue;
        }
        const key = normalized.slice(0, separator).trim();
        if (!key) {
            continue;
        }
        const value = parseEnvValue(normalized.slice(separator + 1));
        entries[key] = value;
    }
    return entries;
}

function uniqueValues(values) {
    return Array.from(new Set(values.filter(Boolean)));
}

async function readEnvSource(filePath) {
    try {
        const text = await fs.readFile(filePath, "utf8");
        return {
            filePath,
            entries: parseEnvFile(text),
        };
    } catch {
        return null;
    }
}

function getCandidateFiles() {
    const explicitFiles = (process.env.GAUSET_LAUNCH_ENV_FILES || "")
        .split(path.delimiter)
        .map((value) => value.trim())
        .filter(Boolean);
    return uniqueValues([...explicitFiles, ...DEFAULT_ENV_FILES]);
}

export async function resolveLaunchEnv({ profile = "platform", keys = launchEnvProfiles[profile] || [] } = {}) {
    const resolved = {};
    const resolution = {};
    const candidateFiles = getCandidateFiles();

    for (const key of keys) {
        const value = (process.env[key] || "").trim();
        if (!value) {
            continue;
        }
        resolved[key] = process.env[key];
        resolution[key] = {
            status: "resolved",
            sourceType: "process",
            sourcePath: null,
        };
    }

    const sources = [];
    for (const filePath of candidateFiles) {
        const source = await readEnvSource(filePath);
        if (source) {
            sources.push(source);
        }
    }

    for (const source of sources) {
        for (const key of keys) {
            if (resolution[key]?.status === "resolved") {
                continue;
            }
            const value = (source.entries[key] || "").trim();
            if (!value) {
                continue;
            }
            resolved[key] = value;
            resolution[key] = {
                status: "resolved",
                sourceType: "file",
                sourcePath: source.filePath,
            };
        }
    }

    for (const key of keys) {
        if (resolution[key]) {
            continue;
        }
        resolution[key] = {
            status: "missing",
            sourceType: null,
            sourcePath: null,
        };
    }

    return {
        env: resolved,
        resolution,
        candidateFiles,
    };
}

export function buildEnvDoctorSummary(profile, resolvedLaunchEnv) {
    const keys = launchEnvProfiles[profile] || [];
    const keysSummary = Object.fromEntries(
        keys.map((key) => [
            key,
            {
                resolved: resolvedLaunchEnv.resolution[key]?.status === "resolved",
                sourceType: resolvedLaunchEnv.resolution[key]?.sourceType ?? null,
                sourcePath: resolvedLaunchEnv.resolution[key]?.sourcePath ?? null,
            },
        ]),
    );

    const resolvedKeys = keys.filter((key) => keysSummary[key].resolved);
    const missingKeys = keys.filter((key) => !keysSummary[key].resolved);
    const sourcePaths = uniqueValues(
        resolvedKeys
            .map((key) => keysSummary[key].sourcePath)
            .filter(Boolean),
    );

    return {
        profile,
        resolvedCount: resolvedKeys.length,
        missingCount: missingKeys.length,
        resolvedKeys,
        missingKeys,
        sourcePaths,
        keys: keysSummary,
    };
}
