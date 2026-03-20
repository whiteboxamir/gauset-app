import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_MANAGEMENT_ACCESS_TOKEN;
const migrationsDir = process.env.SUPABASE_MIGRATIONS_DIR || path.join(process.cwd(), "supabase", "migrations");
const startAt = process.env.SUPABASE_MIGRATION_START_AT || null;

if (!projectRef) {
    throw new Error("SUPABASE_PROJECT_REF is required.");
}

if (!accessToken) {
    throw new Error("SUPABASE_MANAGEMENT_ACCESS_TOKEN is required.");
}

async function listMigrationFiles(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
        .map((entry) => entry.name)
        .sort();
}

async function executeSql(query) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
    });

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Supabase query failed with ${response.status}: ${text}`);
    }

    return text;
}

const files = (await listMigrationFiles(migrationsDir)).filter((file) => (startAt ? file >= startAt : true));

for (const file of files) {
    const absolutePath = path.join(migrationsDir, file);
    const sql = await fs.readFile(absolutePath, "utf8");
    process.stdout.write(`Applying ${file}...\n`);
    await executeSql(sql);
}

process.stdout.write(`Applied ${files.length} migration files to ${projectRef}.\n`);
