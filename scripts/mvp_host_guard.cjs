const FORBIDDEN_PRODUCTION_HOSTS = new Set(["gauset.com", "www.gauset.com", "gnosika.com", "www.gnosika.com"]);
const STRICT_LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DEFAULT_PUBLIC_CERT_ALLOWED_HOSTS = new Set(["gauset-app.vercel.app"]);
const PUBLIC_WRITE_ACK_VALUE = "I_UNDERSTAND_PUBLIC_WRITES";
const PUBLIC_CERT_ALLOWED_HOSTS_ENV = "GAUSET_PUBLIC_CERT_ALLOWED_HOSTS";
const RUN_LABEL_PATTERN = /^[a-z0-9][a-z0-9._-]{2,47}$/;

function stripTrailingSlash(value) {
    return value.replace(/\/$/, "");
}

function parseHttpUrl(rawValue, label) {
    if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
        throw new Error(`${label} must be a non-empty absolute URL.`);
    }

    let url;
    try {
        url = new URL(rawValue.trim());
    } catch {
        throw new Error(`${label} must be an absolute http(s) URL. Received: ${rawValue}`);
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`${label} must use http or https. Received: ${url.protocol}`);
    }

    url.hash = "";
    return url;
}

function assertNoForbiddenProductionHost(rawValue, label) {
    const url = parseHttpUrl(rawValue, label);
    const hostname = url.hostname.toLowerCase();
    if (FORBIDDEN_PRODUCTION_HOSTS.has(hostname)) {
        throw new Error(
            `${label} resolved to forbidden host "${hostname}". This repo must never target gauset.com or gnosika.com.`,
        );
    }
    return url;
}

function assertLocalHost(url, label) {
    const hostname = url.hostname.toLowerCase();
    if (!STRICT_LOCAL_HOSTS.has(hostname)) {
        throw new Error(`${label} must stay local on 127.0.0.1/localhost. Received: ${url.origin}`);
    }
    if (url.protocol !== "http:") {
        throw new Error(`${label} must use plain local http. Received: ${url.toString()}`);
    }
}

function assertPublicHost(url, label) {
    const hostname = url.hostname.toLowerCase();
    if (STRICT_LOCAL_HOSTS.has(hostname)) {
        throw new Error(`${label} must not point at a local host for a public check. Received: ${url.origin}`);
    }
}

function normalizeAllowedHostToken(rawValue, label) {
    const value = String(rawValue || "").trim().toLowerCase();
    if (!value) {
        return "";
    }

    if (value.includes("://")) {
        return parseHttpUrl(value, label).hostname.toLowerCase();
    }

    if (!/^[a-z0-9.-]+$/.test(value)) {
        throw new Error(`${label} must contain hostnames or absolute URLs. Received: ${rawValue}`);
    }

    return value;
}

function resolveAllowedPublicCertificationHosts() {
    const hosts = new Set(DEFAULT_PUBLIC_CERT_ALLOWED_HOSTS);
    const rawHosts = String(process.env[PUBLIC_CERT_ALLOWED_HOSTS_ENV] || "");

    for (const token of rawHosts.split(",")) {
        const hostname = normalizeAllowedHostToken(token, PUBLIC_CERT_ALLOWED_HOSTS_ENV);
        if (hostname) {
            hosts.add(hostname);
        }
    }

    return hosts;
}

function assertAllowedPublicCertificationHost(url, label) {
    const hostname = url.hostname.toLowerCase();
    const allowedHosts = resolveAllowedPublicCertificationHosts();

    if (!allowedHosts.has(hostname)) {
        throw new Error(
            `${label} host "${hostname}" is not in the public certification allowlist. ` +
                `Allowed hosts come from ${PUBLIC_CERT_ALLOWED_HOSTS_ENV} plus defaults: ${Array.from(allowedHosts).join(", ")}`,
        );
    }
}

function assertLocalMvpBaseUrl(rawValue, label = "GAUSET_MVP_BASE_URL") {
    const url = assertNoForbiddenProductionHost(rawValue, label);
    assertLocalHost(url, label);
    return stripTrailingSlash(url.toString());
}

function assertLocalMvpUrl(rawValue, label = "GAUSET_MVP_URL") {
    const url = assertNoForbiddenProductionHost(rawValue, label);
    assertLocalHost(url, label);
    return url.toString();
}

function assertPublicMvpBaseUrl(rawValue, label = "GAUSET_MVP_BASE_URL") {
    const url = assertNoForbiddenProductionHost(rawValue, label);
    assertPublicHost(url, label);
    assertAllowedPublicCertificationHost(url, label);
    return stripTrailingSlash(url.toString());
}

function assertPublicMvpUrl(rawValue, label = "GAUSET_MVP_URL") {
    const url = assertNoForbiddenProductionHost(rawValue, label);
    assertPublicHost(url, label);
    assertAllowedPublicCertificationHost(url, label);
    return url.toString();
}

function sanitizeRunLabel(rawValue) {
    if (typeof rawValue !== "string") {
        return "";
    }

    return rawValue
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
}

function assertPublicCertificationContext(label, options = {}) {
    const requireWriteAck = options.requireWriteAck !== false;
    const rawRunLabel = process.env.GAUSET_PUBLIC_CERT_RUN_LABEL ?? "";
    const runLabel = sanitizeRunLabel(rawRunLabel);

    if (!RUN_LABEL_PATTERN.test(runLabel)) {
        throw new Error(
            `${label} requires GAUSET_PUBLIC_CERT_RUN_LABEL (lowercase slug, 3-48 chars, [a-z0-9._-]). Received: ${rawRunLabel || "<empty>"}`,
        );
    }

    if (requireWriteAck) {
        const writeAck = process.env.GAUSET_PUBLIC_WRITE_ACK ?? "";
        if (writeAck !== PUBLIC_WRITE_ACK_VALUE) {
            throw new Error(
                `${label} performs public writes. Set GAUSET_PUBLIC_WRITE_ACK=${PUBLIC_WRITE_ACK_VALUE} to proceed deliberately.`,
            );
        }
    }

    return {
        runLabel,
        artifactDir: `artifacts/public-live/${runLabel}`,
    };
}

module.exports = {
    DEFAULT_PUBLIC_CERT_ALLOWED_HOSTS: Array.from(DEFAULT_PUBLIC_CERT_ALLOWED_HOSTS),
    FORBIDDEN_PRODUCTION_HOSTS: Array.from(FORBIDDEN_PRODUCTION_HOSTS),
    PUBLIC_CERT_ALLOWED_HOSTS_ENV,
    PUBLIC_WRITE_ACK_VALUE,
    RUN_LABEL_PATTERN: RUN_LABEL_PATTERN.source,
    STRICT_LOCAL_HOSTS: Array.from(STRICT_LOCAL_HOSTS),
    assertLocalMvpBaseUrl,
    assertLocalMvpUrl,
    assertPublicCertificationContext,
    assertPublicMvpBaseUrl,
    assertPublicMvpUrl,
    resolveAllowedPublicCertificationHosts,
    sanitizeRunLabel,
};
