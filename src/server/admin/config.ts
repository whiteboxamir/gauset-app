import { z } from "zod";

const adminEnvSchema = z.object({
    GAUSET_ADMIN_EMAILS: z.string().optional(),
});

function normalizeEmailList(raw?: string) {
    return (raw ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
}

export interface AdminConfig {
    allowedEmails: string[];
}

export function getAdminConfig(env: NodeJS.ProcessEnv = process.env): AdminConfig {
    const parsed = adminEnvSchema.parse(env);

    return {
        allowedEmails: normalizeEmailList(parsed.GAUSET_ADMIN_EMAILS),
    };
}
