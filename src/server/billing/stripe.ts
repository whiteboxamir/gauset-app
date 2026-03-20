import { createHmac, timingSafeEqual } from "node:crypto";

import { requireStripeConfig } from "./config.ts";

const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

function encodeFormValue(value: unknown) {
    if (value === null || value === undefined) {
        return "";
    }
    return typeof value === "boolean" ? String(value) : String(value);
}

function appendFormEntries(params: URLSearchParams, key: string, value: unknown): void {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
        value.forEach((entry, index) => appendFormEntries(params, `${key}[${index}]`, entry));
        return;
    }

    if (typeof value === "object") {
        Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
            appendFormEntries(params, `${key}[${childKey}]`, childValue);
        });
        return;
    }

    params.append(key, encodeFormValue(value));
}

function buildFormBody(payload: Record<string, unknown>) {
    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => appendFormEntries(params, key, value));
    return params;
}

function buildStripeUrl(pathname: string, query?: Record<string, unknown>) {
    const url = new URL(`${STRIPE_API_BASE_URL}/${pathname.replace(/^\//, "")}`);
    if (!query) {
        return url;
    }

    const params = buildFormBody(query);
    params.forEach((value, key) => {
        url.searchParams.append(key, value);
    });
    return url;
}

async function stripeRequest<T>(
    pathname: string,
    options?: {
        method?: "GET" | "POST";
        payload?: Record<string, unknown>;
        query?: Record<string, unknown>;
    },
) {
    const config = requireStripeConfig();
    const headers = new Headers({
        Authorization: `Bearer ${config.stripeSecretKey}`,
    });
    if (config.stripeApiVersion) {
        headers.set("Stripe-Version", config.stripeApiVersion);
    }

    const method = options?.method ?? (options?.payload ? "POST" : "GET");
    let body: URLSearchParams | undefined;
    if (options?.payload) {
        body = buildFormBody(options.payload);
        headers.set("Content-Type", "application/x-www-form-urlencoded");
    }

    const response = await fetch(buildStripeUrl(pathname, options?.query), {
        method,
        headers,
        body,
        cache: "no-store",
    });

    const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!response.ok) {
        throw new Error(json?.error?.message || `Stripe API request failed with ${response.status}.`);
    }
    return json as T;
}

export interface StripeCheckoutSessionResponse {
    id: string;
    url: string | null;
}

export interface StripePortalSessionResponse {
    id: string;
    url: string;
}

export interface StripeCatalogProbe {
    object: string;
    productCount: number;
}

export function createCheckoutSession(payload: Record<string, unknown>) {
    return stripeRequest<StripeCheckoutSessionResponse>("checkout/sessions", {
        method: "POST",
        payload,
    });
}

export function createBillingPortalSession(payload: Record<string, unknown>) {
    return stripeRequest<StripePortalSessionResponse>("billing_portal/sessions", {
        method: "POST",
        payload,
    });
}

export async function probeStripeCatalogAccess(): Promise<StripeCatalogProbe> {
    const response = await stripeRequest<{ object: string; data?: Array<{ id: string }> }>("products", {
        query: {
            limit: 1,
        },
    });
    return {
        object: response.object,
        productCount: Array.isArray(response.data) ? response.data.length : 0,
    };
}

export function retrieveStripeSubscription<T = Record<string, unknown>>(subscriptionId: string, query?: Record<string, unknown>) {
    return stripeRequest<T>(`subscriptions/${subscriptionId}`, {
        query,
    });
}

export function retrieveStripeInvoice<T = Record<string, unknown>>(invoiceId: string, query?: Record<string, unknown>) {
    return stripeRequest<T>(`invoices/${invoiceId}`, {
        query,
    });
}

export function retrieveStripePaymentIntent<T = Record<string, unknown>>(paymentIntentId: string, query?: Record<string, unknown>) {
    return stripeRequest<T>(`payment_intents/${paymentIntentId}`, {
        query,
    });
}

export function retrieveStripeRefund<T = Record<string, unknown>>(refundId: string, query?: Record<string, unknown>) {
    return stripeRequest<T>(`refunds/${refundId}`, {
        query,
    });
}

export function listStripeSubscriptions<T = Record<string, unknown>>(query?: Record<string, unknown>) {
    return stripeRequest<{ data: T[]; has_more?: boolean }>("subscriptions", {
        query,
    });
}

export function listStripeInvoices<T = Record<string, unknown>>(query?: Record<string, unknown>) {
    return stripeRequest<{ data: T[]; has_more?: boolean }>("invoices", {
        query,
    });
}

export function listStripePaymentIntents<T = Record<string, unknown>>(query?: Record<string, unknown>) {
    return stripeRequest<{ data: T[]; has_more?: boolean }>("payment_intents", {
        query,
    });
}

export function listStripeRefunds<T = Record<string, unknown>>(query?: Record<string, unknown>) {
    return stripeRequest<{ data: T[]; has_more?: boolean }>("refunds", {
        query,
    });
}

function parseStripeSignatureHeader(header: string) {
    const parts = header.split(",").map((entry) => entry.trim());
    const timestamp = parts.find((entry) => entry.startsWith("t="))?.slice(2) ?? "";
    const signatures = parts.filter((entry) => entry.startsWith("v1=")).map((entry) => entry.slice(3));
    return {
        timestamp,
        signatures,
    };
}

export function verifyStripeWebhookSignature({
    payload,
    signatureHeader,
}: {
    payload: string;
    signatureHeader: string | null;
}) {
    const { stripeWebhookSecret } = requireStripeConfig();
    if (!stripeWebhookSecret) {
        throw new Error("Stripe webhook secret is not configured.");
    }
    if (!signatureHeader) {
        throw new Error("Missing Stripe-Signature header.");
    }

    const parsed = parseStripeSignatureHeader(signatureHeader);
    if (!parsed.timestamp || parsed.signatures.length === 0) {
        throw new Error("Malformed Stripe-Signature header.");
    }

    const timestampSeconds = Number(parsed.timestamp);
    if (!Number.isFinite(timestampSeconds)) {
        throw new Error("Invalid Stripe-Signature timestamp.");
    }

    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
    if (ageSeconds > DEFAULT_WEBHOOK_TOLERANCE_SECONDS) {
        throw new Error("Stripe webhook timestamp is outside the allowed tolerance.");
    }

    const expected = createHmac("sha256", stripeWebhookSecret).update(`${parsed.timestamp}.${payload}`, "utf8").digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    const isValid = parsed.signatures.some((signature) => {
        const signatureBuffer = Buffer.from(signature, "hex");
        return signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
    });

    if (!isValid) {
        throw new Error("Stripe webhook signature verification failed.");
    }
}
