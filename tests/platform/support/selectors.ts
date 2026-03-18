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
