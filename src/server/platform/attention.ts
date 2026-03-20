export function hoursSince(value: string | null | undefined, now = Date.now()) {
    if (!value) {
        return null;
    }

    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
        return null;
    }

    return Math.max(0, (now - timestamp) / (1000 * 60 * 60));
}

export function formatAgeLabel(value: string | null | undefined, now = Date.now(), emptyLabel = "Needs setup") {
    const hours = hoursSince(value, now);
    if (hours === null) {
        return emptyLabel;
    }
    if (hours < 1) {
        return "Under 1h old";
    }
    if (hours < 24) {
        return `${Math.floor(hours)}h old`;
    }
    if (hours < 24 * 7) {
        return `${Math.floor(hours / 24)}d old`;
    }

    return `${Math.floor(hours / (24 * 7))}w old`;
}

export function formatFreshnessLabel(value: string | null | undefined, now = Date.now(), prefix = "Updated") {
    const hours = hoursSince(value, now);
    if (hours === null) {
        return "Needs setup";
    }
    if (hours < 1) {
        return `${prefix} under 1h ago`;
    }
    if (hours < 24) {
        return `${prefix} ${Math.floor(hours)}h ago`;
    }
    if (hours < 24 * 7) {
        return `${prefix} ${Math.floor(hours / 24)}d ago`;
    }

    return `${prefix} ${Math.floor(hours / (24 * 7))}w ago`;
}
