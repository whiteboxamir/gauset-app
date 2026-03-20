export function teamInviteForm(page) {
    return page
        .locator("form")
        .filter({
            has: page.locator('input[placeholder="newpartner@client.com"]'),
        })
        .first();
}

export function teamInviteEmailInput(page) {
    return page.locator('[data-testid="team-invite-email"], input[placeholder="newpartner@client.com"]').first();
}

export function teamInviteRoleSelect(page) {
    return teamInviteForm(page).locator('[data-testid="team-invite-role"], select').first();
}

export function teamInviteSubmit(page) {
    return teamInviteForm(page).locator('[data-testid="team-invite-submit"], button:has-text("Send invite")').first();
}

export function billingPortalButton(page) {
    return page.locator('[data-testid="billing-open-portal"], button:has-text("Open billing portal")').first();
}

export function securityRevokeOthersButton(page) {
    return page.locator('[data-testid="security-revoke-others"], button:has-text("Revoke other sessions")').first();
}

export function projectLibraryCardByName(page, name) {
    return page
        .locator("#project-library article")
        .filter({
            has: page.getByRole("heading", { name }),
        })
        .first();
}

export const projectCardByName = projectLibraryCardByName;

export function projectLibrarySavedWorldCard(page) {
    return page
        .locator("#project-library article")
        .filter({
            has: page.getByRole("link", { name: /Project home|Open project record/i }),
        })
        .filter({
            hasText: "Saved world ready",
        })
        .first();
}

export function projectRecordLink(scope) {
    return scope.getByRole("link", { name: /Project home|Open project record/i }).first();
}

export function projectChooseSourcePathLink(scope) {
    return scope.getByRole("link", { name: /Choose source path|Start world/i }).first();
}

export function projectCardSavedWorldLaunchButton(scope) {
    return scope.getByRole("button", { name: /Open saved world|Return to saved world|Return to last saved world/i }).first();
}

export function reviewSharePanel(page) {
    return page.locator('[data-testid="review-share-panel"], #review-shares').first();
}

export function reviewShareLinkedSceneSelect(page) {
    return reviewSharePanel(page).locator('[data-testid="review-share-scene-select"], label:has-text("Project world") select, label:has-text("Linked scene") select').first();
}

export function reviewShareSavedVersionSelect(page) {
    return reviewSharePanel(page).locator('[data-testid="review-share-version-select"], label:has-text("Saved version") select').first();
}

export function reviewShareLabelInput(page) {
    return reviewSharePanel(page).locator('[data-testid="review-share-label-input"], input[placeholder="Design-partner v2 review"]').first();
}

export function reviewShareNoteTextarea(page) {
    return reviewSharePanel(page).locator('[data-testid="review-share-note-input"], textarea[placeholder*="design partner should validate"]').first();
}

export function reviewShareCreateButton(page) {
    return reviewSharePanel(page)
        .locator('[data-testid="review-share-create-button"]')
        .or(reviewSharePanel(page).getByRole("button", { name: /Create version-locked review link|Create review-only link/i }))
        .first();
}

export function reviewShareRow(page, label) {
    return reviewSharePanel(page)
        .locator("article")
        .filter({
            has: reviewSharePanel(page).getByText(label, { exact: true }),
        })
        .first();
}

export function reviewShareCopyButton(scope) {
    return scope.locator('[data-testid^="review-share-copy-"], button:has-text("Copy link")').first();
}

export function reviewShareOpenLink(scope) {
    return scope.locator('[data-testid^="review-share-open-"], a:has-text("Open review"), a:has-text("Open current session link")').first();
}

export function reviewShareRevokeButton(scope) {
    return scope.locator('[data-testid^="review-share-revoke-"], button:has-text("Revoke link")').first();
}

export function linkedWorldAdminToggle(page) {
    return page.locator("#linked-world-admin > summary").first();
}

export function worldLinksPanel(page) {
    return page.locator("#world-links").first();
}

export function firstLinkedWorldRecord(page) {
    return worldLinksPanel(page).locator('[data-testid^="world-link-row-"], article').first();
}

export function worldLinkGenericHandoffButton(scope) {
    return scope.locator('[data-testid^="world-link-export-generic-"], button:has-text("Export generic manifest")').first();
}

export function worldLinkUnrealHandoffButton(scope) {
    return scope.locator('[data-testid^="world-link-export-unreal-"], button:has-text("Export Unreal manifest")').first();
}
