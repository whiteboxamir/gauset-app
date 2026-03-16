import db from "@/lib/db";

let initialized = false;

export function ensureProjectStorage() {
    if (initialized) {
        return db;
    }

    db.pragma("foreign_keys = ON");
    db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            owner_email TEXT NOT NULL,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_activity_at TEXT,
            last_world_opened_at TEXT
        );

        CREATE TABLE IF NOT EXISTS project_world_links (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            scene_id TEXT NOT NULL UNIQUE,
            environment_label TEXT,
            source_kind TEXT NOT NULL,
            source_label TEXT,
            lane_kind TEXT NOT NULL,
            lane_label TEXT,
            delivery_posture TEXT NOT NULL,
            delivery_label TEXT,
            delivery_summary TEXT,
            is_primary INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_reopened_at TEXT,
            reopen_count INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_project_world_links_project_id ON project_world_links(project_id, is_primary DESC, created_at DESC);

        CREATE TABLE IF NOT EXISTS project_activity_events (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            actor_email TEXT,
            event_type TEXT NOT NULL,
            summary TEXT NOT NULL,
            metadata_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_project_activity_events_project_id ON project_activity_events(project_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS review_shares (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            scene_id TEXT NOT NULL,
            version_id TEXT,
            label TEXT,
            note TEXT,
            delivery_mode TEXT NOT NULL,
            content_mode TEXT NOT NULL,
            version_locked INTEGER NOT NULL DEFAULT 0,
            payload TEXT,
            payload_digest TEXT,
            share_token TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_by_email TEXT NOT NULL,
            source_kind TEXT NOT NULL,
            source_label TEXT,
            lane_kind TEXT NOT NULL,
            lane_label TEXT,
            delivery_posture TEXT NOT NULL,
            delivery_label TEXT,
            delivery_summary TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            last_accessed_at TEXT,
            revoked_at TEXT,
            revoked_by_email TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_review_shares_project_id ON review_shares(project_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_review_shares_share_token ON review_shares(share_token);

        CREATE TABLE IF NOT EXISTS review_share_events (
            id TEXT PRIMARY KEY,
            review_share_id TEXT NOT NULL,
            actor_email TEXT,
            event_type TEXT NOT NULL,
            summary TEXT NOT NULL,
            request_path TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(review_share_id) REFERENCES review_shares(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_review_share_events_share_id ON review_share_events(review_share_id, created_at DESC);
    `);

    initialized = true;
    return db;
}

export function nowIso() {
    return new Date().toISOString();
}

export function normalizeEmail(value: string) {
    return value.trim().toLowerCase();
}

export function normalizeSceneId(value: string) {
    return value.trim();
}

export function cleanText(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

export function parseMetadata(value: string | null) {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return null;
        }
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}
