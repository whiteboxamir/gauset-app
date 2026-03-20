export function formatDateTime(value: string | null | undefined, fallback = "Not recorded") {
    if (!value) {
        return fallback;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
        return value;
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(parsed);
}

export function formatCurrencyCents(amountCents: number, currency = "USD") {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
        maximumFractionDigits: 2,
    }).format(amountCents / 100);
}
