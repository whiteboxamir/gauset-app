import fs from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const projectRef =
    (process.env.SUPABASE_PROJECT_REF || "").trim() ||
    (() => {
        try {
            return new URL(supabaseUrl).hostname.split(".")[0] || "";
        } catch {
            return "";
        }
    })();
const managementAccessToken = (process.env.SUPABASE_MANAGEMENT_ACCESS_TOKEN || "").trim();
const migrationDirectory = path.resolve(process.env.GAUSET_PLATFORM_MIGRATION_DIR || "supabase/migrations");
const reportPath = process.env.GAUSET_PLATFORM_SCHEMA_AUDIT_REPORT ? path.resolve(process.env.GAUSET_PLATFORM_SCHEMA_AUDIT_REPORT) : null;
const missingEnv = [
    !projectRef ? "SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL" : null,
    !managementAccessToken ? "SUPABASE_MANAGEMENT_ACCESS_TOKEN" : null,
].filter(Boolean);

const expectedTables = [
    "account_flags",
    "admin_notes",
    "audit_events",
    "billing_contacts",
    "billing_customers",
    "credit_ledger",
    "feature_flags",
    "invoice_line_items",
    "invoices",
    "payments",
    "plans",
    "profiles",
    "project_activity_events",
    "project_exports",
    "project_memberships",
    "project_world_links",
    "projects",
    "refunds",
    "review_share_events",
    "review_shares",
    "studio_access_review_entries",
    "studio_access_reviews",
    "studio_approval_requests",
    "studio_branding",
    "studio_coordination_items",
    "studio_governance_policies",
    "studio_invitations",
    "studio_lane_handoffs",
    "studio_memberships",
    "studio_notification_signals",
    "studio_notification_subscriptions",
    "studio_operator_coverage",
    "studios",
    "subscription_items",
    "subscriptions",
    "support_messages",
    "support_threads",
    "usage_events",
    "user_notification_deliveries",
    "user_notification_inbox_snapshots",
    "user_notification_preferences",
    "user_platform_sessions",
];

const expectedColumns = {
    profiles: ["active_studio_id", "avatar_url", "display_name", "email", "onboarding_state", "timezone"],
    review_shares: ["allowed_api_paths", "delivery_mode", "storage_prefixes", "token_id"],
    studio_governance_policies: [
        "max_active_items_per_available_operator",
        "max_urgent_items_per_available_operator",
        "require_handoff_for_away_with_urgent_work",
        "stale_handoff_hours",
        "urgent_ownership_drift_hours",
    ],
    studio_notification_signals: ["audience_label", "body", "domain", "severity", "signal_key", "why"],
    studio_operator_coverage: [
        "covers_billing",
        "covers_projects",
        "covers_support",
        "covers_team",
        "covers_workspace",
        "coverage_status",
        "max_active_items_override",
        "max_urgent_items_override",
    ],
    user_notification_inbox_snapshots: ["preview_delivery_ids", "refreshed_at", "synced_at", "unread_count"],
    user_notification_preferences: ["digest_cadence", "digest_enabled", "digest_hour_utc", "digest_weekday", "in_app_enabled"],
    user_platform_sessions: ["authenticated_at", "label", "provider", "revoked_at", "session_id"],
    usage_events: [
        "debit_amount",
        "image_id",
        "job_id",
        "job_status",
        "job_type",
        "metadata",
        "result_ids",
        "reversed_at",
        "reversed_by_refund_id",
        "studio_id",
        "updated_at",
        "user_id",
    ],
    refunds: ["currency", "invoice_id", "provider_charge_id", "provider_payment_intent_id", "refunded_at", "status", "studio_id", "subscription_id"],
    project_world_links: ["ownership_claimed_at", "ownership_status"],
};

const expectedRoutines = [
    "claim_project_world_link",
    "create_studio_workspace",
    "handle_auth_user_created",
    "platform_allocate_studio_slug",
    "platform_slugify_text",
    "set_updated_at",
];

const expectedIndexes = [
    "audit_events_studio_created_idx",
    "credit_ledger_reference_unique_idx",
    "feature_flags_key_scope_idx",
    "payments_studio_paid_idx",
    "profiles_active_studio_idx",
    "profiles_email_lower_idx",
    "project_world_links_project_active_created_idx",
    "project_world_links_scene_active_owner_idx",
    "refunds_payment_refunded_idx",
    "refunds_studio_refunded_idx",
    "review_share_events_share_created_idx",
    "review_shares_studio_status_created_idx",
    "studio_access_reviews_open_idx",
    "studio_approval_requests_pending_key_idx",
    "studio_coordination_items_studio_status_updated_idx",
    "studio_lane_handoffs_studio_review_idx",
    "studio_notification_subscriptions_lookup_idx",
    "studio_operator_coverage_studio_status_idx",
    "subscriptions_studio_status_idx",
    "support_threads_studio_latest_idx",
    "usage_events_status_updated_idx",
    "usage_events_studio_created_idx",
    "user_notification_inbox_snapshots_user_idx",
    "user_platform_sessions_user_active_idx",
];

const expectedTriggers = [
    "on_auth_user_created",
    "profiles_set_updated_at",
    "review_shares_set_updated_at",
    "studio_governance_policies_set_updated_at",
    "studio_lane_handoffs_set_updated_at",
    "studio_notification_signals_set_updated_at",
    "studio_operator_coverage_set_updated_at",
    "user_notification_inbox_snapshots_set_updated_at",
    "user_platform_sessions_set_updated_at",
];

const expectedPlanRows = {
    design_partner_beta: {
        billing_provider: "manual",
        interval: "custom",
        is_public: false,
        is_active: true,
        mvp_access: "true",
        priority_support: "true",
        admin_console: "false",
    },
    studio_monthly: {
        billing_provider: "stripe",
        interval: "month",
        is_public: true,
        is_active: true,
        mvp_access: "true",
        priority_support: "false",
        admin_console: "false",
    },
    studio_yearly: {
        billing_provider: "stripe",
        interval: "year",
        is_public: true,
        is_active: true,
        mvp_access: "true",
        priority_support: "true",
        admin_console: "false",
    },
};

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

async function loadAppliedMigrationVersions() {
    const candidates = [
        {
            source: "supabase_migrations.schema_migrations",
            query: "select version::text as version from supabase_migrations.schema_migrations order by version",
        },
        {
            source: "supabase_migrations.migrations",
            query: "select version::text as version from supabase_migrations.migrations order by version",
        },
        {
            source: "public.schema_migrations",
            query: "select version::text as version from public.schema_migrations order by version",
        },
    ];

    for (const candidate of candidates) {
        try {
            const rows = await runQuery(candidate.query);
            return {
                source: candidate.source,
                rows,
            };
        } catch {
            continue;
        }
    }

    return {
        source: null,
        rows: null,
    };
}

function listMissing(actualValues, expectedValues) {
    const actual = new Set(actualValues);
    return expectedValues.filter((value) => !actual.has(value));
}

const report = {
    projectRef,
    executedAt: new Date().toISOString(),
    completedAt: null,
    pass: false,
    failureCategory: null,
    missingEnv,
    checks: {},
    warnings: [],
    failures: [],
    error: null,
};

function classifySchemaFailure(message, hasSchemaFailures) {
    if (missingEnv.length > 0) {
        return "missing_credential_env";
    }
    if (hasSchemaFailures) {
        return "code_regression";
    }
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(message)) {
        return "local_host_limitation";
    }
    return "external_service_runtime_issue";
}

try {
    if (missingEnv.length > 0) {
        throw new Error(`Missing required schema audit env: ${missingEnv.join(", ")}.`);
    }

    const migrationFiles = (await fs.readdir(migrationDirectory))
        .filter((entry) => entry.endsWith(".sql"))
        .sort();
    const expectedMigrationVersions = migrationFiles.map((file) => file.split("_")[0]);

    const [migrationMetadata, tableRows, columnRows, routineRows, indexRows, triggerRows, planRows, duplicateOwnerRows, missingClaimTimestampRows, functionDefRows] = await Promise.all([
        loadAppliedMigrationVersions(),
        runQuery("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"),
        runQuery(
            "select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position",
        ),
        runQuery("select routine_name from information_schema.routines where routine_schema = 'public' order by routine_name"),
        runQuery("select indexname, indexdef from pg_indexes where schemaname = 'public' order by indexname"),
        runQuery("select trigger_name, event_object_schema from information_schema.triggers order by trigger_name"),
        runQuery(`select
            code,
            billing_provider,
            interval,
            is_public,
            is_active,
            coalesce(features ->> 'mvpAccess', 'false') as mvp_access,
            coalesce(features ->> 'prioritySupport', 'false') as priority_support,
            coalesce(features ->> 'adminConsole', 'false') as admin_console
        from public.plans
        where code in ('design_partner_beta', 'studio_monthly', 'studio_yearly')
        order by code`),
        runQuery(`
            select
                scene_id,
                count(*)::int as active_owner_count,
                array_agg(project_id order by created_at asc, id asc) as project_ids
            from public.project_world_links
            where ownership_status = 'active'
            group by scene_id
            having count(*) > 1
            order by active_owner_count desc, scene_id asc
        `),
        runQuery(`
            select
                count(*)::int as missing_claim_timestamp_count
            from public.project_world_links
            where ownership_status = 'active'
              and ownership_claimed_at is null
        `),
        runQuery(`
            select pg_get_functiondef('public.claim_project_world_link(uuid,text,text,boolean,uuid)'::regprocedure) as definition
        `),
    ]);

    const appliedMigrationVersions = migrationMetadata.rows ? migrationMetadata.rows.map((row) => row.version) : null;
    const missingMigrationVersions = appliedMigrationVersions ? listMissing(appliedMigrationVersions, expectedMigrationVersions) : [];
    const unexpectedMigrationVersions = appliedMigrationVersions
        ? appliedMigrationVersions.filter((version) => !expectedMigrationVersions.includes(version))
        : [];

    if (appliedMigrationVersions) {
        if (missingMigrationVersions.length > 0) {
            report.failures.push(`Missing applied migration version(s): ${missingMigrationVersions.join(", ")}.`);
        }
        if (unexpectedMigrationVersions.length > 0) {
            report.warnings.push(`Live project has extra migration version(s) beyond the repo set: ${unexpectedMigrationVersions.join(", ")}.`);
        }
    } else {
        report.warnings.push("Live migration metadata table was not exposed through the management query API; relying on direct schema diff.");
    }

    const actualTables = tableRows.map((row) => row.table_name);
    const missingTables = listMissing(actualTables, expectedTables);
    if (missingTables.length > 0) {
        report.failures.push(`Missing expected public table(s): ${missingTables.join(", ")}.`);
    }

    const actualColumnsByTable = new Map();
    for (const row of columnRows) {
        const columns = actualColumnsByTable.get(row.table_name) || [];
        columns.push(row.column_name);
        actualColumnsByTable.set(row.table_name, columns);
    }
    const missingColumns = [];
    for (const [tableName, columns] of Object.entries(expectedColumns)) {
        const actualColumns = actualColumnsByTable.get(tableName) || [];
        for (const column of columns) {
            if (!actualColumns.includes(column)) {
                missingColumns.push({ tableName, column });
            }
        }
    }
    if (missingColumns.length > 0) {
        report.failures.push(
            `Missing expected column(s): ${missingColumns.map((entry) => `${entry.tableName}.${entry.column}`).join(", ")}.`,
        );
    }

    const projectWorldLinkColumns = columnRows.filter((row) => row.table_name === "project_world_links");
    const projectWorldLinkOwnershipStatusColumn = projectWorldLinkColumns.find((row) => row.column_name === "ownership_status");
    const projectWorldLinkOwnershipClaimedAtColumn = projectWorldLinkColumns.find((row) => row.column_name === "ownership_claimed_at");
    if (
        !projectWorldLinkOwnershipStatusColumn ||
        projectWorldLinkOwnershipStatusColumn.data_type !== "text" ||
        projectWorldLinkOwnershipStatusColumn.is_nullable !== "NO" ||
        !/'active'::text/i.test(projectWorldLinkOwnershipStatusColumn.column_default || "")
    ) {
        report.failures.push("project_world_links.ownership_status must remain a required text column with an active default.");
    }
    if (
        !projectWorldLinkOwnershipClaimedAtColumn ||
        projectWorldLinkOwnershipClaimedAtColumn.data_type !== "timestamp with time zone" ||
        projectWorldLinkOwnershipClaimedAtColumn.is_nullable !== "NO" ||
        !/timezone\('utc'::text, now\(\)\)/i.test(projectWorldLinkOwnershipClaimedAtColumn.column_default || "")
    ) {
        report.failures.push("project_world_links.ownership_claimed_at must remain a required UTC timestamptz column with a now() default.");
    }

    const actualRoutines = routineRows.map((row) => row.routine_name);
    const missingRoutines = listMissing(actualRoutines, expectedRoutines);
    if (missingRoutines.length > 0) {
        report.failures.push(`Missing expected function(s): ${missingRoutines.join(", ")}.`);
    }

    const actualIndexes = indexRows.map((row) => row.indexname);
    const missingIndexes = listMissing(actualIndexes, expectedIndexes);
    if (missingIndexes.length > 0) {
        report.failures.push(`Missing expected index(es): ${missingIndexes.join(", ")}.`);
    }

    const projectWorldLinkIndex = indexRows.find((row) => row.indexname === "project_world_links_scene_active_owner_idx");
    if (!projectWorldLinkIndex?.indexdef || !/where\s+\(ownership_status = 'active'::text\)/i.test(projectWorldLinkIndex.indexdef)) {
        report.failures.push("project_world_links_scene_active_owner_idx must remain a partial unique index on active ownership rows.");
    }

    const projectActiveCreatedIndex = indexRows.find((row) => row.indexname === "project_world_links_project_active_created_idx");
    if (!projectActiveCreatedIndex?.indexdef || !/where\s+\(ownership_status = 'active'::text\)/i.test(projectActiveCreatedIndex.indexdef)) {
        report.failures.push("project_world_links_project_active_created_idx must remain a partial active-only index.");
    }

    const actualTriggers = triggerRows.map((row) => row.trigger_name);
    const missingTriggers = listMissing(actualTriggers, expectedTriggers);
    if (missingTriggers.length > 0) {
        report.failures.push(`Missing expected trigger(s): ${missingTriggers.join(", ")}.`);
    }

    const planRowsByCode = new Map(planRows.map((row) => [row.code, row]));
    const missingPlanCodes = Object.keys(expectedPlanRows).filter((code) => !planRowsByCode.has(code));
    const planMismatches = [];
    for (const [code, expected] of Object.entries(expectedPlanRows)) {
        const actual = planRowsByCode.get(code);
        if (!actual) continue;

        for (const [key, expectedValue] of Object.entries(expected)) {
            const actualValue = String(actual[key]);
            if (actualValue !== String(expectedValue)) {
                planMismatches.push({
                    code,
                    field: key,
                    expected: expectedValue,
                    actual: actual[key],
                });
            }
        }
    }
    if (missingPlanCodes.length > 0) {
        report.failures.push(`Missing expected plan seed row(s): ${missingPlanCodes.join(", ")}.`);
    }
    if (planMismatches.length > 0) {
        report.failures.push(
            `Plan seed mismatch(es): ${planMismatches
                .map((entry) => `${entry.code}.${entry.field} expected=${entry.expected} actual=${entry.actual}`)
                .join(", ")}.`,
        );
    }

    if (duplicateOwnerRows.length > 0) {
        report.failures.push(
            `Duplicate active project ownership detected for scene_id(s): ${duplicateOwnerRows
                .map((row) => `${row.scene_id} (${row.active_owner_count})`)
                .join(", ")}.`,
        );
    }

    const missingClaimTimestampCount = missingClaimTimestampRows[0]?.missing_claim_timestamp_count ?? 0;
    if (missingClaimTimestampCount > 0) {
        report.failures.push(`Active project ownership rows missing ownership_claimed_at detected: ${missingClaimTimestampCount}.`);
    }

    const claimDefinition = functionDefRows[0]?.definition ?? "";
    if (!claimDefinition) {
        report.failures.push("claim_project_world_link function definition was not returned by the live schema query.");
    } else {
        if (!/when unique_violation then/i.test(claimDefinition)) {
            report.failures.push("claim_project_world_link should retain unique_violation fallback handling.");
        }
        if (!/on conflict \(project_id, scene_id\) do update/i.test(claimDefinition)) {
            report.failures.push("claim_project_world_link should retain upsert-on-project-and-scene semantics.");
        }
        if (!/ownership_status = 'active'/i.test(claimDefinition)) {
            report.failures.push("claim_project_world_link should continue to claim active ownership rows only.");
        }
        if (!/ownership_claimed_at\s*=\s*v_now/i.test(claimDefinition)) {
            report.failures.push("claim_project_world_link should stamp ownership_claimed_at during claims.");
        }
    }

    report.checks = {
        migrations: {
            migrationDirectory,
            migrationFiles,
            repoMigrationCount: migrationFiles.length,
            latestExpectedVersion: expectedMigrationVersions[expectedMigrationVersions.length - 1] ?? null,
            metadataSource: migrationMetadata.source,
            expectedMigrationVersions,
            appliedMigrationVersions,
            missingMigrationVersions,
            unexpectedMigrationVersions,
        },
        tables: {
            expectedCount: expectedTables.length,
            actualCount: actualTables.length,
            missingTables,
        },
        columns: {
            missingColumns,
        },
        routines: {
            missingRoutines,
        },
        indexes: {
            missingIndexes,
            activeOwnerIndexDefinition: projectWorldLinkIndex?.indexdef ?? null,
            activeProjectCreatedIndexDefinition: projectActiveCreatedIndex?.indexdef ?? null,
        },
        triggers: {
            missingTriggers,
        },
        planSeeds: {
            rows: planRows,
            missingPlanCodes,
            mismatches: planMismatches,
        },
        activeOwnership: {
            duplicateOwnerRows,
            missingClaimTimestampCount,
            claimDefinitionPresent: Boolean(claimDefinition),
        },
    };

    report.pass = report.failures.length === 0;
    if (!report.pass) {
        report.failureCategory = "code_regression";
        process.exitCode = 1;
    }
} catch (error) {
    report.error = error instanceof Error ? error.message : "Live platform schema audit failed.";
    report.failureCategory = classifySchemaFailure(report.error, report.failures.length > 0);
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    if (reportPath) {
        await fs.mkdir(path.dirname(reportPath), { recursive: true });
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report, null, 2));
}
