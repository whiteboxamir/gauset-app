export type BillingErrorCode =
    | "billing_operation_failed"
    | "billing_customer_missing"
    | "manual_plan"
    | "missing_active_studio"
    | "plan_already_active"
    | "plan_not_found"
    | "stripe_not_configured"
    | "webhook_signature_invalid";

export class BillingContractError extends Error {
    readonly code: BillingErrorCode;
    readonly status: number;

    constructor(code: BillingErrorCode, message: string, status = 400) {
        super(message);
        this.name = "BillingContractError";
        this.code = code;
        this.status = status;
    }
}

function inferBillingErrorCode(message: string): BillingErrorCode {
    if (/active studio/i.test(message)) {
        return "missing_active_studio";
    }
    if (/already on the selected plan/i.test(message)) {
        return "plan_already_active";
    }
    if (/selected plan was not found/i.test(message)) {
        return "plan_not_found";
    }
    if (/handled manually|manual provisioning/i.test(message)) {
        return "manual_plan";
    }
    if (/no stripe customer is attached/i.test(message)) {
        return "billing_customer_missing";
    }
    if (/stripe is not configured/i.test(message)) {
        return "stripe_not_configured";
    }
    if (/signature/i.test(message)) {
        return "webhook_signature_invalid";
    }
    return "billing_operation_failed";
}

export function describeBillingError(error: unknown, fallbackMessage: string) {
    if (error instanceof BillingContractError) {
        return {
            code: error.code,
            message: error.message,
            status: error.status,
        };
    }

    if (error instanceof Error) {
        return {
            code: inferBillingErrorCode(error.message),
            message: error.message,
            status: 400,
        };
    }

    return {
        code: "billing_operation_failed" as const,
        message: fallbackMessage,
        status: 400,
    };
}
