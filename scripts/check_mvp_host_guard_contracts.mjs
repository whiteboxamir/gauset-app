import assert from "node:assert/strict";
import hostGuard from "./mvp_host_guard.cjs";

const {
    PUBLIC_WRITE_ACK_VALUE,
    assertLocalMvpBaseUrl,
    assertPublicCertificationContext,
    assertPublicMvpBaseUrl,
} = hostGuard;

const originalEnv = {
    GAUSET_PUBLIC_CERT_ALLOWED_HOSTS: process.env.GAUSET_PUBLIC_CERT_ALLOWED_HOSTS,
    GAUSET_PUBLIC_CERT_RUN_LABEL: process.env.GAUSET_PUBLIC_CERT_RUN_LABEL,
    GAUSET_PUBLIC_WRITE_ACK: process.env.GAUSET_PUBLIC_WRITE_ACK,
};

function expectThrow(run, pattern) {
    let error = null;
    try {
        run();
    } catch (candidate) {
        error = candidate;
    }

    assert(error, "Expected an error but none was thrown.");
    assert.match(String(error.message), pattern);
}

try {
    delete process.env.GAUSET_PUBLIC_CERT_ALLOWED_HOSTS;
    delete process.env.GAUSET_PUBLIC_CERT_RUN_LABEL;
    delete process.env.GAUSET_PUBLIC_WRITE_ACK;

    assert.equal(assertLocalMvpBaseUrl("http://127.0.0.1:3015", "local contract"), "http://127.0.0.1:3015");
    expectThrow(() => assertLocalMvpBaseUrl("https://gauset-app.vercel.app", "local contract"), /must stay local/i);
    expectThrow(() => assertLocalMvpBaseUrl("https://gauset.com", "local contract"), /forbidden host/i);

    assert.equal(
        assertPublicMvpBaseUrl("https://gauset-app.vercel.app", "public contract"),
        "https://gauset-app.vercel.app",
    );
    expectThrow(() => assertPublicMvpBaseUrl("http://127.0.0.1:3015", "public contract"), /must not point at a local host/i);
    expectThrow(() => assertPublicMvpBaseUrl("https://gauset.com", "public contract"), /forbidden host/i);
    expectThrow(
        () => assertPublicMvpBaseUrl("https://preview-unsafe.vercel.app", "public contract"),
        /allowlist/i,
    );

    process.env.GAUSET_PUBLIC_CERT_ALLOWED_HOSTS = "preview-safe.vercel.app";
    assert.equal(
        assertPublicMvpBaseUrl("https://preview-safe.vercel.app", "public contract"),
        "https://preview-safe.vercel.app",
    );

    process.env.GAUSET_PUBLIC_CERT_RUN_LABEL = "phase1-cert-01";
    expectThrow(() => assertPublicCertificationContext("public context contract"), /performs public writes/i);

    process.env.GAUSET_PUBLIC_WRITE_ACK = PUBLIC_WRITE_ACK_VALUE;
    const writeContext = assertPublicCertificationContext("public context contract");
    assert.equal(writeContext.runLabel, "phase1-cert-01");

    const readOnlyContext = assertPublicCertificationContext("public preflight contract", { requireWriteAck: false });
    assert.equal(readOnlyContext.runLabel, "phase1-cert-01");

    console.log("MVP host guard contract checks passed.");
} finally {
    if (originalEnv.GAUSET_PUBLIC_CERT_ALLOWED_HOSTS === undefined) {
        delete process.env.GAUSET_PUBLIC_CERT_ALLOWED_HOSTS;
    } else {
        process.env.GAUSET_PUBLIC_CERT_ALLOWED_HOSTS = originalEnv.GAUSET_PUBLIC_CERT_ALLOWED_HOSTS;
    }

    if (originalEnv.GAUSET_PUBLIC_CERT_RUN_LABEL === undefined) {
        delete process.env.GAUSET_PUBLIC_CERT_RUN_LABEL;
    } else {
        process.env.GAUSET_PUBLIC_CERT_RUN_LABEL = originalEnv.GAUSET_PUBLIC_CERT_RUN_LABEL;
    }

    if (originalEnv.GAUSET_PUBLIC_WRITE_ACK === undefined) {
        delete process.env.GAUSET_PUBLIC_WRITE_ACK;
    } else {
        process.env.GAUSET_PUBLIC_WRITE_ACK = originalEnv.GAUSET_PUBLIC_WRITE_ACK;
    }
}
