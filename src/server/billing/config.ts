import { z } from "zod";

const billingEnvSchema = z.object({
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_API_VERSION: z.string().optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

function normalize(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export interface BillingConfig {
    stripeSecretKey: string | null;
    stripeWebhookSecret: string | null;
    stripeApiVersion: string | null;
    appUrl: string | null;
}

export function getBillingConfig(env: NodeJS.ProcessEnv = process.env): BillingConfig {
    const parsed = billingEnvSchema.parse(env);
    return {
        stripeSecretKey: normalize(parsed.STRIPE_SECRET_KEY),
        stripeWebhookSecret: normalize(parsed.STRIPE_WEBHOOK_SECRET),
        stripeApiVersion: normalize(parsed.STRIPE_API_VERSION),
        appUrl: normalize(parsed.NEXT_PUBLIC_APP_URL) ?? normalize(parsed.NEXT_PUBLIC_SITE_URL),
    };
}

export function isStripeConfigured(env: NodeJS.ProcessEnv = process.env) {
    return Boolean(getBillingConfig(env).stripeSecretKey);
}

export function requireStripeConfig(env: NodeJS.ProcessEnv = process.env) {
    const config = getBillingConfig(env);
    if (!config.stripeSecretKey) {
        throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY before enabling billing routes.");
    }
    return {
        ...config,
        stripeSecretKey: config.stripeSecretKey,
    };
}
