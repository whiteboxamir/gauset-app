import type { CreditEntryType } from "../../types/platform/common.ts";

import { restInsert, restSelect } from "../db/rest.ts";

interface CreditLedgerRow {
    id: string;
    studio_id: string;
    user_id: string | null;
    entry_type: CreditEntryType;
    amount: number;
    balance_after: number | null;
    reference_type: string | null;
    reference_id: string | null;
    note: string | null;
    created_by_user_id: string | null;
    created_at: string;
}

export interface RecordCreditLedgerEntryResult {
    entry: CreditLedgerRow;
    created: boolean;
}

function normalizeOptionalText(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

async function resolveExistingEntry({
    studioId,
    entryType,
    referenceType,
    referenceId,
}: {
    studioId: string;
    entryType: CreditEntryType;
    referenceType: string;
    referenceId: string;
}) {
    const rows = await restSelect<CreditLedgerRow[]>("credit_ledger", {
        select: "id,studio_id,user_id,entry_type,amount,balance_after,reference_type,reference_id,note,created_by_user_id,created_at",
        filters: {
            studio_id: `eq.${studioId}`,
            entry_type: `eq.${entryType}`,
            reference_type: `eq.${referenceType}`,
            reference_id: `eq.${referenceId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveLatestBalance(studioId: string) {
    const rows = await restSelect<Array<{ balance_after: number | null }>>("credit_ledger", {
        select: "balance_after",
        filters: {
            studio_id: `eq.${studioId}`,
            order: "created_at.desc",
            limit: "1",
        },
    });
    return rows[0]?.balance_after ?? 0;
}

export async function recordCreditLedgerEntry({
    studioId,
    userId = null,
    entryType,
    amount,
    referenceType = null,
    referenceId = null,
    note = null,
    createdByUserId = null,
}: {
    studioId: string;
    userId?: string | null;
    entryType: CreditEntryType;
    amount: number;
    referenceType?: string | null;
    referenceId?: string | null;
    note?: string | null;
    createdByUserId?: string | null;
}): Promise<RecordCreditLedgerEntryResult> {
    if (!Number.isInteger(amount) || amount === 0) {
        throw new Error("Credit ledger entries must use a non-zero integer amount.");
    }

    const normalizedReferenceType = normalizeOptionalText(referenceType);
    const normalizedReferenceId = normalizeOptionalText(referenceId);
    if ((normalizedReferenceType && !normalizedReferenceId) || (!normalizedReferenceType && normalizedReferenceId)) {
        throw new Error("Credit ledger references require both a type and an id.");
    }

    if (normalizedReferenceType && normalizedReferenceId) {
        const existing = await resolveExistingEntry({
            studioId,
            entryType,
            referenceType: normalizedReferenceType,
            referenceId: normalizedReferenceId,
        });
        if (existing) {
            return {
                entry: existing,
                created: false,
            };
        }
    }

    const currentBalance = await resolveLatestBalance(studioId);
    const balanceAfter = currentBalance + amount;
    const inserted = await restInsert<CreditLedgerRow[]>("credit_ledger", {
        studio_id: studioId,
        user_id: userId,
        entry_type: entryType,
        amount,
        balance_after: balanceAfter,
        reference_type: normalizedReferenceType,
        reference_id: normalizedReferenceId,
        note: normalizeOptionalText(note),
        created_by_user_id: createdByUserId,
    });

    return {
        entry: inserted[0],
        created: true,
    };
}

export function recordBillingCreditGrant({
    studioId,
    invoiceId,
    amount,
    note,
}: {
    studioId: string;
    invoiceId: string;
    amount: number;
    note?: string | null;
}) {
    return recordCreditLedgerEntry({
        studioId,
        entryType: "grant",
        amount,
        referenceType: "invoice",
        referenceId: invoiceId,
        note,
    });
}

export function recordBillingGrantReversal({
    studioId,
    invoiceId,
    amount,
    note,
}: {
    studioId: string;
    invoiceId: string;
    amount: number;
    note?: string | null;
}) {
    return recordCreditLedgerEntry({
        studioId,
        entryType: "reversal",
        amount: -Math.abs(amount),
        referenceType: "invoice",
        referenceId: invoiceId,
        note,
    });
}

export function recordUsageDebit({
    studioId,
    userId = null,
    usageEventId,
    amount,
    note,
}: {
    studioId: string;
    userId?: string | null;
    usageEventId: string;
    amount: number;
    note?: string | null;
}) {
    const debitAmount = -Math.abs(amount);
    return recordCreditLedgerEntry({
        studioId,
        userId,
        entryType: "usage",
        amount: debitAmount,
        referenceType: "usage_event",
        referenceId: usageEventId,
        note,
    });
}

export function recordRefundCredit({
    studioId,
    refundId,
    amount,
    note,
}: {
    studioId: string;
    refundId: string;
    amount: number;
    note?: string | null;
}) {
    return recordCreditLedgerEntry({
        studioId,
        entryType: "refund",
        amount: Math.abs(amount),
        referenceType: "refund",
        referenceId: refundId,
        note,
    });
}
