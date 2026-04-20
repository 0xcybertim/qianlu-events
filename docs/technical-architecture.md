# Qianlu Events Technical Architecture

## Purpose

This document defines the technical architecture for v1 of the Qianlu Events platform.

It translates the approved product direction into an implementation plan using the chosen stack:

- React Router v7 Framework mode
- Node.js
- Fastify
- REST
- Postgres
- Prisma
- Zod
- Tailwind CSS with CSS variables
- Monorepo
- Render hosting
- Google Cloud Storage for assets

## Architecture Goals

- Fast mobile-first participant experience
- Clean separation between frontend, backend, and shared domain logic
- Event-driven configuration rather than hard-coded campaign logic
- Persistent backend state for sessions, tasks, verification, and rewards
- Low-friction anonymous participation in v1
- Clear path toward staff tooling, email login, and multi-company support later

## High-Level System Overview

The system will be a monorepo containing:

- a React Router v7 web app for participants
- a Fastify REST API for backend logic
- shared packages for types, schemas, and domain helpers
- Prisma schema and migrations for Postgres

At runtime:

1. The participant scans an event QR code
2. The web app resolves the event from the slug
3. A participant session is created or resumed
4. The participant completes tasks
5. Task claims and forms are saved through the API
6. Reward status is recalculated server-side
7. A summary screen is shown to staff
8. Staff can use a hidden PIN-protected verification action
9. Verification results are stored in Postgres

## Monorepo Structure

Recommended initial structure:

```text
/
  apps/
    web/
    api/
  packages/
    config/
    domain/
    schemas/
    ui/
  prisma/
    schema.prisma
    migrations/
  scripts/
  docs/
```

### `apps/web`

Participant-facing mobile web app built with React Router v7 in Framework mode.

Responsibilities:

- event landing pages
- task list and task detail flows
- participant session UX
- summary and verification-ready screens
- calling API endpoints through loaders and actions

### `apps/api`

Fastify backend API.

Responsibilities:

- event lookup
- participant session creation and session resolution
- task claim handling
- form submission handling
- reward calculation
- verification actions
- asset upload coordination if needed later

### `packages/config`

Environment configuration and shared constants.

### `packages/domain`

Pure business logic such as:

- reward calculation
- bonus rule evaluation
- task state transitions
- eligibility checks

### `packages/schemas`

Shared Zod schemas for:

- API payloads
- form validation
- route input/output contracts

### `packages/ui`

Small internal component layer shared by the web app.

Initial components can include:

- Button
- TaskCard
- StatusBadge
- ProgressBar
- SummaryCard
- FormField

## Frontend Architecture

### Chosen Framework

Use React Router v7 in Framework mode.

Why this fits:

- route loaders and actions match the app’s read/write flow well
- server rendering improves QR landing performance
- forms integrate cleanly with route actions
- nested routing is useful for event and task flows

### Frontend Responsibilities

- render event-specific participant pages
- read event and session state from loaders
- submit mutations through actions or fetchers
- preserve a mobile-first interaction model
- expose the staff verification trigger only in a protected hidden flow

### Route Shape

Recommended initial route structure:

```text
/
/:eventSlug
/:eventSlug/tasks
/:eventSlug/tasks/:taskId
/:eventSlug/scan/:token
/:eventSlug/summary
/:eventSlug/verify
```

Notes:

- `/:eventSlug` is the QR destination
- `/:eventSlug/tasks` is the main participant checklist
- `/:eventSlug/tasks/:taskId` handles detail and form interactions
- `/:eventSlug/scan/:token` accepts printed QR-backed stamp scans
- `/:eventSlug/summary` is the participant summary screen
- `/:eventSlug/verify` is a hidden staff verification route or modal flow

### Data Loading Strategy

Use React Router loaders and actions as the default data flow.

Use loaders for:

- event data
- participant session state
- task list state
- summary state

Use actions for:

- creating a participant session
- claiming task completion
- submitting forms
- verifying tasks
- entering a staff PIN

No separate client-side data layer is needed in v1 beyond what React Router already provides.

## Backend Architecture

### Chosen Framework

Use Fastify for the API layer.

Why this fits:

- lightweight and fast
- good plugin system
- clean TypeScript ergonomics
- structured enough for long-term growth without Nest complexity

### API Style

Use REST endpoints.

Why this fits:

- the domain maps cleanly to resource-oriented endpoints
- easier to reason about than GraphQL for v1
- simpler operationally

### API Responsibility Boundaries

The API is the source of truth for:

- event configuration retrieval
- session creation and session lookup
- task submission and task state transitions
- QR-backed stamp scan validation
- validation
- reward calculation
- verification persistence

The web app should not calculate trusted reward state on its own.

## Database Architecture

### Chosen Database

Use Postgres.

### Chosen ORM

Use Prisma.

Why this fits:

- fast startup for schema and migration management
- mature ecosystem
- good developer ergonomics
- acceptable tradeoff for v1 speed and clarity

### Data Ownership

Postgres stores:

- events
- tasks
- participant sessions
- form submissions
- task attempts
- QR codes and QR scan audit rows
- verification actions
- reward eligibility records
- future placeholders for organizations and staff users

### QR-Backed Stamp Scans

Stamp scans are modeled as task completion events, not as a separate reward
system. A printed QR code opens `/:eventSlug/scan/:token`; the web loader
ensures a participant session exists and posts the raw token to the API.

The API hashes the raw token with SHA-256 and looks up `QrCode.tokenHash`.
Raw QR tokens are never stored in Postgres, task config, or event/task API
responses. `QrCode` rows link an event and a normal `Task` whose type is
`STAMP_SCAN`.

For an accepted scan, the API writes a `QrScan` row, upserts the linked
`TaskAttempt` as completed without extra staff verification, and calls the
same session reward recalculation used by task claims and form submissions.
This keeps points, tiers, and reward eligibility derived from task attempts.

Rejected scans are also logged when the token resolves to a known QR code.
The MVP result states are:

- `ACCEPTED`
- `DUPLICATE`
- `EXPIRED`
- `INACTIVE`
- `WRONG_EVENT`

Duplicate protection is enforced per participant session and QR code using
accepted scan count against `QrCode.scanLimitPerSession`, which defaults to
one. Validity windows use optional `validFrom` and `validUntil`; inactive QR
codes, unpublished events, and inactive linked tasks return an inactive result.

Stamp-run grouping remains an MVP-level task configuration concern via
non-secret config such as `stampRunKey` and `stampRunLabel`. The grouping
metadata may be exposed to clients, but QR tokens must not be stored there.

## Core Data Model

### Event

Represents one event or campaign.

Suggested fields:

- id
- slug
- name
- status
- startsAt
- endsAt
- brandingJson
- settingsJson
- createdAt
- updatedAt

### Task

Represents a task configured for an event.

Suggested fields:

- id
- eventId
- type
- platform
- title
- description
- points
- sortOrder
- requiresVerification
- verificationType
- configJson
- isActive

### ParticipantSession

Represents one participant journey for one event.

Suggested fields:

- id
- eventId
- anonymousToken
- email
- name
- claimedPoints
- verifiedPoints
- rewardTier
- instantRewardEligible
- dailyDrawEligible
- createdAt
- updatedAt

### TaskAttempt

Represents the participant’s state for a single task.

Suggested fields:

- id
- participantSessionId
- taskId
- status
- claimedAt
- verifiedAt
- rejectedAt
- verificationRequired
- proofJson
- createdAt
- updatedAt

### VerificationAction

Represents a staff verification action.

Suggested fields:

- id
- participantSessionId
- taskAttemptId
- action
- verifiedByType
- verifiedByIdentifier
- notes
- createdAt

### RewardEligibility

Represents eligibility output for rewards.

Suggested fields:

- id
- participantSessionId
- rewardType
- rewardKey
- eligible
- verified
- reason
- createdAt
- updatedAt

### Future Tables Not Required In V1

- Organization
- Brand
- StaffUser
- EventStaffAssignment
- PrizeDrawRun

These should remain future-ready in naming and schema design, but they do not need to be fully implemented in v1.

## Session Architecture

### V1 Session Strategy

Use anonymous participant sessions with a secure token by default, with optional
email magic-link login for participants who want to resume progress on another
device.

Behavior:

- first visit creates a participant session
- the participant receives an `httpOnly` cookie with the session token
- subsequent requests reuse the session
- lead data such as name and email can be attached later through form tasks
- requesting a participant login link creates a short-lived one-time token
- consuming the link attaches the current anonymous session to the participant
  account, or resumes the account-linked session for that event

### Why This Is The Right V1 Choice

- lowest friction on the event floor
- no mandatory sign-up before participation
- still allows lead capture through tasks
- allows optional cross-device resume without making accounts mandatory

### Participant Account Support

The account layer is intentionally small:

- `ParticipantAccount` stores a unique email address.
- `ParticipantLoginToken` stores hashed one-time magic-link tokens.
- `ParticipantSession.participantAccountId` links one event session to an
  account after email verification.

Anonymous sessions remain fully supported when participants skip email login.

## Verification Architecture

### Approved Verification Model

Use the participant summary screen plus a hidden staff confirmation action protected by a short staff PIN.

### Flow

1. Participant completes tasks
2. Participant opens the summary screen
3. Staff reviews proof on the participant’s phone
4. Staff opens the hidden verification action
5. Staff enters a short PIN
6. Staff confirms or rejects tasks
7. The verification result is stored in Postgres
8. Reward eligibility is recalculated

### Why This Is Better Than Visual-Only Checking

- stores a reliable record for instant reward decisions
- supports daily draw auditability
- reduces disputes later
- keeps v1 simple without needing a separate staff app

### Staff PIN Notes

V1 should treat the staff PIN as a shared operational secret per event or per environment.

Later upgrades can move to:

- named staff accounts
- staff device sessions
- staff roles and permissions

## Event Configuration Architecture

### Approved Model

Use DB-backed event configuration with either:

- a simple internal setup script
- an internal-only admin page later

### Why This Fits

- avoids hard-coding event content in the app
- supports multiple events cleanly
- makes future client/event onboarding easier

### Config Domains

Each event configuration should define:

- event identity
- branding
- task list
- point values
- bonus rules
- reward rules
- copy shown on landing and summary screens
- verification requirements

### Initial Setup Workflow

Recommended v1 setup flow:

1. Create event record
2. Create task records
3. Create reward rule records or reward config
4. Publish QR slug
5. Test participant flow on mobile

## Reward Calculation Architecture

Reward calculation should live in shared domain logic, executed server-side.

The system should distinguish:

- claimed progress
- verified progress

Why:

- participants need immediate feedback
- instant rewards must depend on verified state
- daily draw logic may depend on verified completions

Recommended implementation:

- each mutation that changes task state triggers recalculation
- recalculation updates participant session summary fields
- reward eligibility records are inserted or updated as needed

## Validation Architecture

### Chosen Library

Use Zod.

Use Zod for:

- request body validation
- query param validation
- form submission validation
- shared schema definitions between web and API

Recommended approach:

- define schemas in `packages/schemas`
- parse all inbound API payloads at the boundary
- map validated payloads into domain functions

## Styling Architecture

### Chosen Approach

Use Tailwind CSS with CSS variables for event branding.

### Why This Fits

- fast to build mobile layouts
- easy to theme by event
- low overhead
- works well with a small internal component layer

### Branding Strategy

Keep brand styling event-driven through CSS variables such as:

- `--color-primary`
- `--color-secondary`
- `--color-accent`
- `--color-surface`
- `--color-text`

The frontend should map event branding config to these variables at runtime.

## Asset Storage Architecture

### Chosen Storage

Use Google Cloud Storage.

### V1 Use Cases

- event branding assets
- future uploaded participant media if enabled
- export artifacts later if needed

### Guidance

For v1, do not overbuild upload flows if photo proof is only shown to staff and not uploaded.

Use GCS where actual stored assets are needed.

## Internal Component Layer

Use a small internal component layer, not a large design system.

Recommended first components:

- `Button`
- `ScreenShell`
- `TaskCard`
- `StatusBadge`
- `PointsPill`
- `ProgressBar`
- `SummaryCard`
- `TextField`
- `TextareaField`
- `ActionLink`

The component layer should stay thin and tailored to the participant event flow.

## API Endpoint Shape

Recommended initial endpoints:

### Event

- `GET /events/:slug`

### Participant Session

- `POST /sessions`
- `GET /sessions/current`

### Tasks

- `POST /task-attempts/:taskId/claim`
- `POST /task-attempts/:taskId/form-submit`
- `POST /task-attempts/:taskId/mark-pending`

### Summary

- `GET /sessions/current/summary`

### Verification

- `POST /verification/pin/verify`
- `POST /verification/task-attempts/:taskAttemptId/approve`
- `POST /verification/task-attempts/:taskAttemptId/reject`

These names can change, but the resource boundaries should stay consistent.

## Security Considerations

Minimum v1 security requirements:

- `httpOnly` secure cookie for participant session token
- CSRF protection strategy for form and mutation endpoints
- server-side validation with Zod
- no trust in client-calculated reward state
- hashed staff PIN storage
- rate limiting on sensitive endpoints such as PIN verification
- basic auditability on verification actions

## Deployment Architecture

### Hosting

Use Render.

Recommended deployment units:

- web service for `apps/web`
- web service for `apps/api`
- managed Postgres
- cron job for scheduled tasks

### Scheduled Jobs

Use hosting-platform cron on Render.

V1 cron use cases:

- daily draw preparation jobs
- reward cleanup jobs if needed
- reporting snapshots later if needed

Do not introduce a queue system in v1 unless a clear requirement appears.

## Environment Configuration

Expected environment values will include:

- database connection string
- session secret
- staff PIN hash or verification secret
- API base URL
- app base URL
- GCS bucket name
- GCS credentials
- event default settings if needed

Keep these centralized in shared config utilities.

## Recommended Build Order

1. Set up monorepo structure
2. Create React Router web app and Fastify API app
3. Configure Tailwind, shared packages, and TypeScript
4. Set up Prisma with Postgres
5. Implement event, task, and session schema
6. Build participant event routing and session bootstrapping
7. Build task list, task detail, and form flows
8. Implement server-side reward calculation
9. Build summary screen and staff PIN verification flow
10. Deploy to Render and test on-device

## Deferred Architecture Decisions

These can wait until after v1 is underway:

- whether web and API should later be merged into one deployable service
- whether staff verification should later move into a dedicated app
- whether email login should use magic links or one-time codes
- whether a future admin tool should be embedded in the same app or split out

## Architecture Summary

The approved v1 architecture is:

- Monorepo
- React Router v7 Framework mode frontend
- Fastify REST API backend
- Postgres with Prisma
- Zod validation
- Anonymous participant session with room for email login later
- Staff verification through a hidden PIN-protected action
- DB-backed event configuration
- Tailwind CSS with CSS variables
- Google Cloud Storage for assets
- Render hosting with platform cron

This is a strong v1 shape because it is simple enough to build quickly, while still preserving the platform qualities needed for future multi-event and multi-company growth.
