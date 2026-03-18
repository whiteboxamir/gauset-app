import fs from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const workspaceRoot = process.cwd();
const migrationPath = path.resolve(workspaceRoot, "supabase/migrations/20260317121000_project_world_link_active_ownership.sql");
const projectRef =
    (process.env.SUPABASE_PROJECT_REF || "").trim() ||
    (() => {
        try {
            const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
            return new URL(supabaseUrl).hostname.split(".")[0] || "";
        } catch {
            return "";
        }
    })();
const managementAccessToken = (process.env.SUPABASE_MANAGEMENT_ACCESS_TOKEN || "").trim();
const reportPath = process.env.GAUSET_PROJECT_WORLD_LINK_AUDIT_REPORT
    ? path.resolve(process.env.GAUSET_PROJECT_WORLD_LINK_AUDIT_REPORT)
    : null;

async function runQuery(query) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${managementAccessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
    });

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Supabase query failed with ${response.status}: ${text}`);
    }

    return text ? JSON.parse(text) : [];
}

function assertIncludes(source, needle, label, failures) {
    if (!source.includes(needle)) {
        failures.push(`Missing required migration token: ${label}.`);
    }
}

function assertRegex(source, pattern, label, failures) {
    if (!pattern.test(source)) {
        failures.push(`Missing required migration pattern: ${label}.`);
    }
}

const report = {
    executedAt: new Date().toISOString(),
    migrationPath,
    checks: {},
    failures: [],
    warnings: [],
    liveChecks: {
        attempted: false,
        blockedByEnv: false,
        duplicates: [],
        missingClaimTimestampCount: null,
    },
    pass: false,
    error: null,
};

try {
    const migrationSource = await fs.readFile(migrationPath, "utf8");
    const migrationChecks = [];

    assertIncludes(migrationSource, "create unique index if not exists project_world_links_scene_active_owner_idx", "active owner unique index", migrationChecks);
    assertIncludes(migrationSource, "create index if not exists project_world_links_project_active_created_idx", "active created lookup index", migrationChecks);
    assertIncludes(migrationSource, "ownership_status = 'active'", "active ownership status enforcement", migrationChecks);
    assertIncludes(migrationSource, "ownership_claimed_at", "ownership claim timestamp column", migrationChecks);
    assertIncludes(migrationSource, "alter column ownership_claimed_at set not null", "ownership claim timestamp required", migrationChecks);
    assertIncludes(migrationSource, "when unique_violation then", "unique violation fallback", migrationChecks);
    assertIncludes(migrationSource, "on conflict (project_id, scene_id) do update", "claim upsert conflict handling", migrationChecks);
    assertRegex(
        migrationSource,
        /select\s+project_id\s+into\s+v_conflicting_project_id[\s\S]+and ownership_status = 'active'/i,
        "active-scene conflict probe",
        migrationChecks,
    );
    assertRegex(
        migrationSource,
        /row_number\(\) over \(\s*partition by scene_id\s*order by is_primary desc, created_at asc, id asc\s*\)/i,
        "ownership backfill ranking",
        migrationChecks,
    );

    report.checks.migration = {
        activeOwnerUniqueIndexPresent: migrationSource.includes("project_world_links_scene_active_owner_idx"),
        activeCreatedIndexPresent: migrationSource.includes("project_world_links_project_active_created_idx"),
        uniqueViolationHandled: migrationSource.includes("when unique_violation then"),
        conflictUpsertHandled: migrationSource.includes("on conflict (project_id, scene_id) do update"),
    };

    if (migrationChecks.length > 0) {
        report.failures.push(...migrationChecks);
    }

    if (projectRef && managementAccessToken) {
        report.liveChecks.attempted = true;
        const duplicateRows = await runQuery(`
            select
                scene_id,
                count(*)::int as active_owner_count,
                json_agg(project_id order by created_at asc, id asc) as project_ids
            from public.project_world_links
            where ownership_status = 'active'
            group by scene_id
            having count(*) > 1
            order by active_owner_count desc, scene_id asc
        `);
        const missingClaimTimestampRows = await runQuery(`
            select
                count(*)::int as missing_claim_timestamp_count
            from public.project_world_links
            where ownership_status = 'active'
              and ownership_claimed_at is null
        `);

        report.liveChecks.duplicates = duplicateRows;
        report.liveChecks.missingClaimTimestampCount = missingClaimTimestampRows[0]?.missing_claim_timestamp_count ?? null;
        if (duplicateRows.length > 0) {
            report.failures.push(
                `Live duplicate active owner(s) detected for scene_id(s): ${duplicateRows
                    .map((row) => `${row.scene_id} (${row.active_owner_count})`)
                    .join(", ")}.`,
            );
        }
        if ((missingClaimTimestampRows[0]?.missing_claim_timestamp_count ?? 0) > 0) {
            report.failures.push(
                `Live active ownership rows missing ownership_claimed_at detected: ${missingClaimTimestampRows[0].missing_claim_timestamp_count}.`,
            );
        }
    } else {
        report.liveChecks.blockedByEnv = true;
        report.warnings.push("Live duplicate-owner query skipped because SUPABASE_PROJECT_REF / SUPABASE_MANAGEMENT_ACCESS_TOKEN are missing.");
    }

    report.pass = report.failures.length === 0;
    if (!report.pass) {
        process.exitCode = 1;
    }
} catch (error) {
    report.error = error instanceof Error ? error.message : "Project world-link ownership audit failed.";
    process.exitCode = 1;
}

if (reportPath) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
}

console.log(JSON.stringify(report, null, 2));
