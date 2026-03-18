import { z } from "zod";

import { supportThreadPriorityValues, supportThreadStatusValues } from "@/types/platform/common";

export const supportMessageSchema = z.object({
    messageId: z.string().uuid(),
    threadId: z.string().uuid(),
    authorUserId: z.string().uuid().nullable(),
    authorType: z.enum(["user", "admin", "system"]),
    body: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }),
});

export const supportThreadSummarySchema = z.object({
    threadId: z.string().uuid(),
    studioId: z.string().uuid(),
    projectId: z.string().uuid().nullable(),
    projectName: z.string().min(1).nullable(),
    subject: z.string().min(1),
    status: z.enum(supportThreadStatusValues),
    priority: z.enum(supportThreadPriorityValues),
    openedByUserId: z.string().uuid().nullable(),
    assignedAdminUserId: z.string().uuid().nullable(),
    latestMessageAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    messageCount: z.number().int().nonnegative(),
    latestMessagePreview: z.string().min(1).nullable(),
});

export const supportThreadDetailSchema = z.object({
    thread: supportThreadSummarySchema,
    messages: z.array(supportMessageSchema),
});

export type SupportMessage = z.infer<typeof supportMessageSchema>;
export type SupportThreadSummary = z.infer<typeof supportThreadSummarySchema>;
export type SupportThreadDetail = z.infer<typeof supportThreadDetailSchema>;
