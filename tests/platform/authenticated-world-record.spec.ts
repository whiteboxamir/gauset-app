import { expect, test } from "@playwright/test";

import { downstreamHandoffContractName } from "@/server/contracts/downstream-handoff";

import { ensureSeededOwnerBaseline, establishOwnerPlatformSession } from "./support/auth";
import { canRunAuthenticatedPlatformE2E, getAuthenticatedPlatformE2EBlocker } from "./support/env";
import {
    firstLinkedWorldRecord,
    linkedWorldAdminToggle,
    projectCardSavedWorldLaunchButton,
    projectLibrarySavedWorldCard,
    projectRecordLink,
    reviewShareCopyButton,
    reviewShareCreateButton,
    reviewShareLabelInput,
    reviewShareNoteTextarea,
    reviewShareOpenLink,
    reviewSharePanel,
    reviewShareRevokeButton,
    reviewShareRow,
    reviewShareSavedVersionSelect,
    worldLinkGenericHandoffButton,
    worldLinkUnrealHandoffButton,
    worldLinksPanel,
} from "./support/selectors";

function readProjectIdFromUrl(url: string) {
    const match = url.match(/\/app\/worlds\/([^/?#]+)/);
    return match?.[1] ?? null;
}

async function openSavedWorldProjectRecord(page) {
    await page.goto("/app/worlds", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Build one world\. Save it once\. Then direct it\./i })).toBeVisible();

    const savedWorldCard = projectLibrarySavedWorldCard(page);
    await expect(
        savedWorldCard,
        "Expected the seeded owner baseline to expose at least one saved-world project card.",
    ).toBeVisible();
    await expect(projectCardSavedWorldLaunchButton(savedWorldCard)).toBeVisible();

    await projectRecordLink(savedWorldCard).click();
    await expect(page).toHaveURL(/\/app\/worlds\/[^/?#]+$/);

    const projectId = readProjectIdFromUrl(page.url());
    expect(projectId, "Expected project record URL to contain a project id.").toBeTruthy();
    await expect(reviewSharePanel(page)).toBeVisible();

    return projectId as string;
}

test.describe("authenticated world-record hostile QA", () => {
    test.describe.configure({ mode: "serial", timeout: 180_000 });
    test.skip(!canRunAuthenticatedPlatformE2E(), getAuthenticatedPlatformE2EBlocker());

    test("routes the authenticated world library into a saved-world project record", async ({ context, page }) => {
        await establishOwnerPlatformSession(context);
        await ensureSeededOwnerBaseline(context);

        await page.goto("/app/worlds", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: /Build one world\. Save it once\. Then direct it\./i })).toBeVisible();

        const savedWorldCard = projectLibrarySavedWorldCard(page);
        await expect(savedWorldCard).toBeVisible();
        await expect(projectRecordLink(savedWorldCard)).toBeVisible();
        await expect(projectCardSavedWorldLaunchButton(savedWorldCard)).toBeVisible();

        await projectRecordLink(savedWorldCard).click();
        await expect(page).toHaveURL(/\/app\/worlds\/[^/?#]+$/);
        await expect(reviewSharePanel(page).getByRole("heading", { name: "Version-locked review links" })).toBeVisible();
        await expect(page.locator("#project-world-launch")).toBeVisible();
    });

    test("exercises review-share controls and world handoff controls from the project record", async ({ context, page }) => {
        await establishOwnerPlatformSession(context);
        await ensureSeededOwnerBaseline(context);

        const projectId = await openSavedWorldProjectRecord(page);
        const label = `hostile-world-record-${Date.now()}`;

        await expect(reviewShareSavedVersionSelect(page)).toBeVisible();
        await expect
            .poll(async () => {
                return await reviewShareSavedVersionSelect(page).inputValue();
            }, { timeout: 30_000 })
            .not.toBe("");
        await expect(reviewShareCreateButton(page)).toBeEnabled({ timeout: 30_000 });

        await reviewShareLabelInput(page).fill(label);
        await reviewShareNoteTextarea(page).fill("Hostile QA pass: verify the saved-world review link stays version-locked and revocable.");

        const createShareResponsePromise = page.waitForResponse(
            (response) => response.url().includes("/api/review-shares") && response.request().method() === "POST",
        );
        await reviewShareCreateButton(page).click();
        const createShareResponse = await createShareResponsePromise;
        const createSharePayload = (await createShareResponse.json()) as { message?: string; shareUrl?: string; shareMode?: string };
        expect(createShareResponse.ok(), createSharePayload.message || "Review-share creation failed.").toBeTruthy();
        expect(createSharePayload.shareUrl, "Review-share creation should return a share URL.").toBeTruthy();

        await expect(reviewSharePanel(page).getByTestId("review-share-message")).toContainText(/ready/i);
        const shareRow = reviewShareRow(page, label);
        await expect(shareRow).toBeVisible();
        await expect(reviewShareCopyButton(shareRow)).toBeVisible();
        await expect(reviewShareOpenLink(shareRow)).toBeVisible();

        const copyShareResponsePromise = page.waitForResponse(
            (response) => response.url().includes("/api/review-shares/") && response.url().includes("/copy") && response.request().method() === "POST",
        );
        await reviewShareCopyButton(shareRow).click();
        const copyShareResponse = await copyShareResponsePromise;
        const copySharePayload = (await copyShareResponse.json()) as { message?: string };
        expect(copyShareResponse.ok(), copySharePayload.message || "Review-share copy tracking failed.").toBeTruthy();
        await expect(reviewSharePanel(page).getByText(`Copied ${label}.`)).toBeVisible();

        const revokeShareResponsePromise = page.waitForResponse(
            (response) => response.url().includes("/api/review-shares/") && response.url().includes("/revoke") && response.request().method() === "POST",
        );
        await reviewShareRevokeButton(shareRow).click();
        const revokeShareResponse = await revokeShareResponsePromise;
        const revokeSharePayload = (await revokeShareResponse.json()) as { success?: boolean; message?: string };
        expect(revokeShareResponse.ok(), revokeSharePayload.message || "Review-share revoke failed.").toBeTruthy();
        expect(revokeSharePayload.success).toBe(true);
        await expect(reviewSharePanel(page).getByText(`Revoked ${label}.`)).toBeVisible();
        await expect(reviewShareRow(page, label)).toBeVisible();
        await expect(reviewShareRow(page, label).getByText(/revoked|Stopped by operator/i)).toBeVisible();

        await linkedWorldAdminToggle(page).click();
        await expect(worldLinksPanel(page)).toBeVisible();

        const linkedWorldRow = firstLinkedWorldRecord(page);
        await expect(linkedWorldRow).toBeVisible();
        await expect(linkedWorldRow.getByText(/There is no separate manual reopen action here/i)).toBeVisible();

        const genericHandoffResponsePromise = page.waitForResponse(
            (response) =>
                response.url().includes(`/api/projects/${projectId}/world-links/`) &&
                response.url().includes("target=generic") &&
                response.request().method() === "GET",
        );
        await worldLinkGenericHandoffButton(linkedWorldRow).click();
        const genericHandoffResponse = await genericHandoffResponsePromise;
        const genericHandoffPayload = (await genericHandoffResponse.json()) as {
            contract?: string;
            message?: string;
            target?: { system?: string; profile?: string; label?: string };
            source?: { version_id?: string };
        };
        expect(genericHandoffResponse.ok(), genericHandoffPayload.message || "Generic handoff export failed.").toBeTruthy();
        expect(genericHandoffPayload.contract).toBe(downstreamHandoffContractName);
        expect(genericHandoffPayload.target?.system).toBe("generic_downstream");
        expect(genericHandoffPayload.target?.profile).toBe("generic_scene_package/v1");
        expect(genericHandoffPayload.source?.version_id).toBeTruthy();

        const unrealHandoffResponsePromise = page.waitForResponse(
            (response) =>
                response.url().includes(`/api/projects/${projectId}/world-links/`) &&
                response.url().includes("target=unreal") &&
                response.request().method() === "GET",
        );
        await worldLinkUnrealHandoffButton(linkedWorldRow).click();
        const unrealHandoffResponse = await unrealHandoffResponsePromise;
        const unrealHandoffPayload = (await unrealHandoffResponse.json()) as {
            contract?: string;
            message?: string;
            target?: { system?: string; profile?: string; label?: string };
            source?: { version_id?: string };
        };
        expect(unrealHandoffResponse.ok(), unrealHandoffPayload.message || "Unreal handoff export failed.").toBeTruthy();
        expect(unrealHandoffPayload.contract).toBe(downstreamHandoffContractName);
        expect(unrealHandoffPayload.target?.system).toBe("unreal_engine");
        expect(unrealHandoffPayload.target?.profile).toBe("unreal_scene_package/v1");
        expect(unrealHandoffPayload.source?.version_id).toBeTruthy();
    });
});
