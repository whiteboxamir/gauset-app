import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createReviewShareToken() {
    return randomBytes(24).toString("base64url");
}

export function reviewShareTokenMatches(expected: string | null | undefined, candidate: string | null | undefined) {
    if (!expected || !candidate) {
        return false;
    }

    const expectedBuffer = Buffer.from(expected);
    const candidateBuffer = Buffer.from(candidate);

    if (expectedBuffer.length !== candidateBuffer.length) {
        return false;
    }

    return timingSafeEqual(expectedBuffer, candidateBuffer);
}

export function createPayloadDigest(payload: string) {
    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
