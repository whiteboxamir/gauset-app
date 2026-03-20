# Gauset Design-Partner Beta Parallel Execution Blueprint

Date: March 12, 2026

Status: Historical planning blueprint. The freeze it described is now landed and superseded by `/Users/amirboz/gauset-app/docs/post-merge-truth-freeze-baseline.md` plus `/Users/amirboz/gauset-app/maps/file-ownership.md`.

## Objective

Ship a design-partner beta that feels like a premium creative software company:

- invite-only onboarding
- real authentication and session management
- billing, invoices, payments, and entitlements
- profile, security, team, and studio settings
- project and world library
- purchase history and account history
- internal admin and support tooling
- protected access to `/mvp` without disturbing Phase 2 editor architecture

The constraint is non-negotiable:

- the account-platform workstream must not collide with active Phase 2 work in the editor, scene graph, or generation stack

## Core Rule

True zero-conflict parallelism only exists if each thread has:

- exclusive file ownership
- exclusive API ownership
- exclusive schema ownership
- no shared refactors
- no shared dependency churn after the platform freeze

This blueprint assumes all account-platform work is executed in separate `git worktree`s from a single frozen base commit created by a short foundation thread.

## Current Repo Boundary

These paths are Phase 2-owned and are off-limits to the account-platform threads:

- `/Users/amirboz/gauset-app/src/app/mvp`
- `/Users/amirboz/gauset-app/src/components/Editor`
- `/Users/amirboz/gauset-app/src/lib/scene-graph`
- `/Users/amirboz/gauset-app/src/state`
- `/Users/amirboz/gauset-app/backend`
- `/Users/amirboz/gauset-app/vercel-backend`

These existing files are temporary or placeholder business-layer surfaces and should be replaced or retired by the platform threads:

- `/Users/amirboz/gauset-app/src/app/actions.ts`
- `/Users/amirboz/gauset-app/src/app/login/page.tsx`
- `/Users/amirboz/gauset-app/src/app/dashboard/page.tsx`
- `/Users/amirboz/gauset-app/src/app/api/waitlist/route.ts`
- `/Users/amirboz/gauset-app/src/lib/db.ts`
- `/Users/amirboz/gauset-app/src/lib/supabase.ts`

## Required Platform Freeze

March 15, 2026 update:

- this freeze is now in place
- the root config and shared truth surfaces are already frozen
- do not use this document to reopen root config or cross-thread contract work
- use the post-merge truth-freeze baseline for the current stop-sign list and next-batch ownership boundaries

Before parallel work begins, one short serial thread must land a platform freeze commit.

That thread owns and freezes:

- `/Users/amirboz/gauset-app/package.json`
- `/Users/amirboz/gauset-app/next.config.mjs`
- `/Users/amirboz/gauset-app/tsconfig.json`
- `/Users/amirboz/gauset-app/src/app/layout.tsx`
- `/Users/amirboz/gauset-app/src/app/globals.css`
- new root platform folders listed below

The platform freeze thread must decide and wire the shared stack:

- Supabase Auth + Postgres
- Stripe
- Resend or Postmark
- Sentry
- PostHog

After that commit lands, no other thread may change shared dependencies or root app wiring.

## New File Tree

The account-platform work should be built in a parallel app shell, not inside the Phase 2 editor tree.

Create and reserve these directories during the platform freeze:

```text
src/app/(auth)/
src/app/(auth)/login/
src/app/(auth)/register/
src/app/(auth)/accept-invite/
src/app/(auth)/auth/

src/app/(app)/
src/app/(app)/dashboard/
src/app/(app)/worlds/
src/app/(app)/billing/
src/app/(app)/settings/profile/
src/app/(app)/settings/security/
src/app/(app)/settings/notifications/
src/app/(app)/team/
src/app/(app)/support/

src/app/(admin)/
src/app/(admin)/accounts/
src/app/(admin)/billing/
src/app/(admin)/support/
src/app/(admin)/flags/

src/app/api/auth/
src/app/api/billing/
src/app/api/projects/
src/app/api/team/
src/app/api/account/
src/app/api/admin/
src/app/api/support/
src/app/api/stripe/
src/app/api/webhooks/

src/components/auth/
src/components/dashboard/
src/components/worlds/
src/components/billing/
src/components/settings/
src/components/team/
src/components/admin/
src/components/support/
src/components/platform/

src/server/auth/
src/server/account/
src/server/billing/
src/server/projects/
src/server/team/
src/server/admin/
src/server/support/
src/server/flags/
src/server/db/
src/server/events/
src/server/contracts/

src/types/platform/
supabase/
supabase/migrations/
docs/platform/
```

## Data Model

The account-platform data model owns identity, ownership, entitlements, history, and support.

The editor and generation stack continue to own scene content, scene versions, review payloads, and generation artifacts.

### Identity Domain

- `users`
  - canonical app user record
- `profiles`
  - display name, avatar, title, timezone, onboarding state
- `sessions`
  - device/session metadata if mirrored locally
- `user_notification_preferences`

### Studio Domain

- `studios`
  - company or team workspace
- `studio_memberships`
  - `owner`, `admin`, `member`, `finance`
- `studio_invitations`
- `studio_branding`

### Billing Domain

- `plans`
  - beta, design-partner, paid tiers
- `billing_customers`
  - Stripe customer mapping
- `subscriptions`
  - active plan snapshot
- `subscription_items`
  - seat and usage details if needed
- `invoices`
- `invoice_line_items`
- `payments`
- `refunds`
- `credit_ledger`
- `billing_contacts`

### Project Domain

- `projects`
  - top-level user-visible object
- `project_memberships`
  - user access to a project
- `project_world_links`
  - mapping from internal `project_id` to external `scene_id`
- `project_activity_events`
- `project_exports`

### Support And Ops Domain

- `support_threads`
- `support_messages`
- `account_flags`
- `feature_flags`
- `audit_events`
- `admin_notes`

## Frozen Ownership Contract

This contract prevents overlap with Phase 2.

- `project_id`
  - account-platform primary object
  - owned by `src/server/projects`
- `scene_id`
  - editor/generation world identifier
  - remains owned by the existing MVP stack
- `project_world_links`
  - sole mapping layer between account platform and world/editor layer

No account-platform thread should rename, reinterpret, or replace `scene_id`.

No Phase 2 thread should add account, billing, or entitlement logic to scene graph state.

## API Contract Map

The account-platform threads own only the routes below.

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/register`
- `POST /api/auth/accept-invite`
- `POST /api/auth/resend-verification`
- `GET /api/auth/session`

Owner:

- identity thread

### Billing

- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `GET /api/billing/summary`
- `GET /api/billing/invoices`
- `GET /api/billing/payments`
- `GET /api/billing/credits`
- `POST /api/webhooks/stripe`

Owner:

- billing thread

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `GET /api/projects/:projectId/activity`
- `GET /api/projects/:projectId/world-links`

Owner:

- worlds/dashboard thread

### Team And Account

- `GET /api/account/profile`
- `PATCH /api/account/profile`
- `GET /api/account/security`
- `PATCH /api/account/security`
- `GET /api/team/members`
- `POST /api/team/invitations`
- `PATCH /api/team/members/:membershipId`
- `DELETE /api/team/invitations/:invitationId`

Owner:

- account/team/settings thread

### Admin And Support

- `GET /api/admin/accounts`
- `PATCH /api/admin/accounts/:accountId/flags`
- `POST /api/admin/accounts/:accountId/credits`
- `GET /api/admin/billing`
- `GET /api/support/threads`
- `POST /api/support/threads`
- `POST /api/support/messages`

Owner:

- admin/support thread

### Late Integration Only

These are the only allowed bridge surfaces into the MVP stack:

- `/Users/amirboz/gauset-app/src/app/api/mvp/[...path]/route.ts`
- access gating for `/Users/amirboz/gauset-app/src/app/mvp/page.tsx`
- any account-aware routing/redirect logic that decides whether a signed-in user may enter `/mvp`

Owner:

- final integration thread only

## Page And Widget Map

These are the user-facing surfaces required for design-partner beta.

### `(auth)` Routes

- `login`
  - email, Google, invite acceptance continuation
- `register`
  - invite-first onboarding
- `accept-invite`
  - role, studio, and account creation

### `(app)` Routes

- `dashboard`
  - recent worlds
  - current plan
  - seat usage
  - usage and credits
  - latest invoice
  - recent activity
  - system/support panel
- `worlds`
  - project cards
  - filters
  - search
  - owner and collaborator badges
  - last-opened metadata
  - open in `/mvp`
- `billing`
  - plan summary
  - payment method
  - invoices
  - purchase history
  - credit ledger
  - customer portal link
- `settings/profile`
  - identity, title, avatar, timezone
- `settings/security`
  - sessions, sign-out-all, auth providers
- `settings/notifications`
  - email and product notices
- `team`
  - members, roles, invites, seat use
- `support`
  - thread list, contact, release notes, status

### `(admin)` Routes

- `accounts`
  - inspect users, studios, plans, flags
- `billing`
  - invoice failures, credits, manual overrides
- `support`
  - support queue and account context
- `flags`
  - feature-flag control by user or studio

## Worktree And Branch Matrix

All worktrees must branch from the same platform freeze commit.

Naming convention:

- branch prefix: `codex/`
- worktree root: sibling directories outside the main checkout

Example commands after the freeze commit exists:

```bash
git worktree add ../gauset-app-platform-freeze -b codex/platform-freeze <freeze-sha>
git worktree add ../gauset-app-identity -b codex/identity <freeze-sha>
git worktree add ../gauset-app-billing -b codex/billing <freeze-sha>
git worktree add ../gauset-app-worlds -b codex/worlds-dashboard <freeze-sha>
git worktree add ../gauset-app-account -b codex/account-team-settings <freeze-sha>
git worktree add ../gauset-app-admin -b codex/admin-support <freeze-sha>
git worktree add ../gauset-app-integration -b codex/final-integration <freeze-sha>
```

### Thread Matrix

`T0 Platform Freeze`

- branch: `codex/platform-freeze`
- worktree: `../gauset-app-platform-freeze`
- owns:
  - root config freeze
  - directory scaffolding
  - dependency freeze
  - shared providers
  - shared server bootstrapping
  - database migration baseline

`T1 Identity`

- branch: `codex/identity`
- worktree: `../gauset-app-identity`
- owns:
  - `src/app/(auth)`
  - `src/components/auth`
  - `src/server/auth`
  - `src/app/api/auth`

`T2 Billing`

- branch: `codex/billing`
- worktree: `../gauset-app-billing`
- owns:
  - `src/app/(app)/billing`
  - `src/components/billing`
  - `src/server/billing`
  - `src/app/api/billing`
  - `src/app/api/stripe`
  - `src/app/api/webhooks`

`T3 Worlds And Dashboard`

- branch: `codex/worlds-dashboard`
- worktree: `../gauset-app-worlds`
- owns:
  - `src/app/(app)/dashboard`
  - `src/app/(app)/worlds`
  - `src/components/dashboard`
  - `src/components/worlds`
  - `src/server/projects`
  - `src/app/api/projects`

`T4 Account, Team, Settings`

- branch: `codex/account-team-settings`
- worktree: `../gauset-app-account`
- owns:
  - `src/app/(app)/settings`
  - `src/app/(app)/team`
  - `src/components/settings`
  - `src/components/team`
  - `src/server/account`
  - `src/server/team`
  - `src/app/api/account`
  - `src/app/api/team`

`T5 Admin And Support`

- branch: `codex/admin-support`
- worktree: `../gauset-app-admin`
- owns:
  - `src/app/(admin)`
  - `src/components/admin`
  - `src/components/support`
  - `src/server/admin`
  - `src/server/support`
  - `src/server/flags`
  - `src/app/api/admin`
  - `src/app/api/support`

`T6 Final Integration`

- branch: `codex/final-integration`
- worktree: `../gauset-app-integration`
- owns only:
  - `/Users/amirboz/gauset-app/src/app/login/page.tsx`
  - `/Users/amirboz/gauset-app/src/app/dashboard/page.tsx`
  - `/Users/amirboz/gauset-app/src/app/page.tsx`
  - `/Users/amirboz/gauset-app/src/app/api/waitlist/route.ts`
  - `/Users/amirboz/gauset-app/src/app/api/mvp/[...path]/route.ts`
  - route redirects into the new `(auth)` and `(app)` shells
  - `/mvp` entitlement gate

`T6` starts only after `T1` through `T5` are merged.

## Shared Contracts To Define In T0

These contracts must be defined once and then frozen.

### Server Contracts

- `src/server/contracts/auth.ts`
  - session shape
  - auth guard result
- `src/server/contracts/billing.ts`
  - billing summary
  - entitlement summary
- `src/server/contracts/projects.ts`
  - project card
  - project activity row
  - world link shape
- `src/server/contracts/team.ts`
  - membership and invitation shape
- `src/server/contracts/admin.ts`
  - admin account summary

### Database Utilities

- `src/server/db/client.ts`
- `src/server/db/types.ts`
- `src/server/db/guards.ts`

### Shared Platform Components

- `src/components/platform/AppShell.tsx`
- `src/components/platform/Sidebar.tsx`
- `src/components/platform/Topbar.tsx`
- `src/components/platform/EmptyState.tsx`
- `src/components/platform/StatusBadge.tsx`

Only `T0` may define or revise these shared surfaces.

## Integration Contract With Phase 2

The account platform must treat the editor as a protected worker plane.

The correct flow is:

1. authenticated user opens project in the app shell
2. app shell checks entitlement and project membership
3. app resolves `project_id -> scene_id`
4. app allows navigation into `/mvp`
5. app proxies approved calls to the existing MVP backend routes

The incorrect flow is:

- pushing billing logic into Python backends
- storing account state in the editor store
- coupling scene-graph persistence to user-account schema changes

## Merge Order

Merge in this order only:

1. `T0 Platform Freeze`
2. `T1 Identity`
3. `T2 Billing`
4. `T3 Worlds And Dashboard`
5. `T4 Account, Team, Settings`
6. `T5 Admin And Support`
7. `T6 Final Integration`

The order of `T1` through `T5` can vary if they remain within owned paths.

`T6` is always last.

## Merge Gates

Every thread must pass:

- route ownership check
- no edits to forbidden Phase 2 paths
- no root dependency changes after `T0`
- thread-local tests
- typecheck for the owned surface if isolated

`T6` must additionally pass:

- auth flow smoke test
- billing entitlement smoke test
- project-to-world access test
- protected `/mvp` route test
- no regression in existing MVP proxy behavior

## Stop Signs

Stop the parallel plan and re-freeze if any thread needs to change:

- `package.json`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `next.config.mjs`
- `tsconfig.json`
- any file under `src/app/mvp`
- any file under `src/components/Editor`
- any file under `src/lib/scene-graph`
- any file under `src/state`
- any file under `backend`
- any file under `vercel-backend`

If that happens, the original freeze was too weak and another short serial cut is required.

## Design-Partner Beta Exit Criteria

The account-platform build is ready when a user can:

1. receive an invite
2. register and log in with a real session
3. see a premium dashboard
4. view their plan, invoices, and payment method
5. view their worlds and activity history
6. manage profile, security, and notifications
7. invite teammates and assign roles
8. contact support from inside the app
9. open an entitled world in `/mvp`

## Immediate First Move

Do not start five threads from the current moving target.

Start with `T0 Platform Freeze`, land the skeleton and frozen contracts, then fork the parallel worktrees from that exact commit.

That is the only route that is both warp-speed and clean.
