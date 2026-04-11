# Qianlu Events Implementation Plan

## Purpose

This document translates the product spec and technical architecture into an execution plan.

It is meant to answer:

- what is already done
- what should happen next
- what the MVP delivery phases are
- what can wait until later

## Current Status

The project now has a functional backend-backed participant foundation:

- monorepo with npm workspaces
- `apps/web` using React Router v7 Framework mode
- `apps/api` using Fastify
- shared `config`, `domain`, `schemas`, and `ui` packages
- Prisma schema for the core event and participant models
- local Postgres via Docker Compose
- first Prisma migration and seeded demo event
- event landing, task list, task detail, and summary routes loading real backend data
- task claim and form submission endpoints working
- server-side reward recalculation for claimed points and reward tiers
- staff PIN verification endpoints working
- first staff-device verification panel added at `/:eventSlug/staff`
- participant summary now shows a staff-facing verification code
- approve and reject actions updating verified reward state
- first organizer setup/reporting panel added under `/admin`
- admin auth now uses database-backed organizer accounts and httpOnly session
  cookies
- organizer event access is scoped with `OWNER`, `EDITOR`, and `VIEWER` roles
- organizer APIs can list/create/update events, manage tasks, read participant
  and lead reports, review reward eligibility, and export leads CSV
- working root scripts for install, typecheck, build, migration, and seed flows

This means the app has moved beyond a pure scaffold into a first usable internal
admin workflow with event-scoped account access, but operational polish is still
pending.

Recent progress:

- event branding now applies from database values on the participant and staff screens
- task detail screens now use task-type-specific copy and action labels
- demo social and WhatsApp tasks now support config-driven external URLs
- proof hints for staff review are now driven by task config
- `/admin/events/:eventSlug` can edit event name, status, branding colors,
  enabled reward types, and reward tiers
- `/admin/events/:eventSlug/tasks` can create, edit, activate, deactivate,
  reorder, and configure tasks
- the demo seed creates an organizer account and grants it owner access to
  `demo-event`

## Primary Objective

Build the first functional version of the Qianlu Events platform for our own event, while keeping the structure reusable for future events and later multi-company support.

## Delivery Strategy

The recommended strategy is:

1. make the current scaffold functional
2. connect the participant flow to real backend data
3. implement the first real event configuration and session lifecycle
4. implement task completion and verification
5. polish the mobile UX for event use

## Phase 1: Foundation

Status: completed

Included:

- initial docs
- product direction
- v1 scope
- technical architecture
- monorepo setup
- web and API scaffold
- shared package structure
- Prisma schema

## Phase 2: Real Data Wiring

Status: completed

Goal:

Replace placeholders and hardcoded content with real event, task, and session data.

Tasks:

- create local `.env` conventions for app, API, and database
- create first Prisma migration
- connect the API to a real Postgres database
- run the demo seed script successfully
- wire the event landing route to fetch the real event by slug
- wire session bootstrap on first participant visit
- load task list data from backend instead of static arrays

Output:

- the demo event is fully backed by Postgres
- scanning or opening `/:eventSlug` produces a real participant session
- the task list reflects actual database records

## Phase 3: Participant Task Flow

Status: completed

Goal:

Implement actual participant interactions for tasks.

Tasks:

- build task detail routing based on task type
- implement social link-out task flow
- implement form task flow
- implement booth validation task flow
- persist task claim state in backend
- show claimed versus pending versus verified statuses correctly

Output:

- a participant can complete tasks in a real flow
- backend stores claims and task attempts
- current progress:
  - social tasks can now be claimed
  - lead form tasks can now be submitted
  - claimed points and reward tier update after mutation
  - summary and task list reflect updated backend state
  - social and WhatsApp tasks can now link out to configured external URLs

## Phase 4: Rewards And Verification

Status: in progress

Goal:

Make the scoring and staff-check flow functional.

Tasks:

- implement reward calculation from task attempts
- store claimed points and verified points
- implement tier thresholds from event config
- implement daily draw eligibility logic
- implement hidden staff PIN verification flow
- add approve and reject actions for task attempts
- recalculate reward eligibility after verification

Output:

- instant reward logic works
- tier reward logic works
- daily draw eligibility is stored
- staff verification is recorded in backend
- current progress:
  - approve and reject endpoints are implemented
  - staff PIN validation is implemented
  - verified points update after staff review
  - reward eligibility records update after verification

## Phase 5: Event Configuration

Status: completed for v1

Goal:

Move event behavior into configuration so the app is reusable.

Tasks:

- define the first stable event config shape
- support event branding from database
- support reward rules from database
- support task ordering and activation from database
- add a simple internal setup script or internal-only admin page

Output:

- a new event can be created without changing participant route code
- event visuals and rules are configurable
- current progress:
  - database branding is applied across the mobile experience
  - task config now supports external URLs, CTA labels, and proof hints
  - the seed script defines the first reusable config examples
  - the organizer panel provides a practical internal event settings form
  - the organizer panel provides task create, edit, and soft-disable controls

## Phase 5A: Organizer Reporting

Status: completed for v1

Goal:

Give internal organizers enough reporting to run an event without database
access.

Tasks:

- protect organizer routes with account auth separate from staff PIN auth
- require per-event organizer access before reading or mutating event data
- list events and open an event overview
- show participant sessions with claimed/verified score state
- show lead submissions from lead, newsletter, and WhatsApp tasks
- show instant reward, daily draw, and tier eligibility counts
- add a CSV export for leads

Output:

- `/admin` provides the organizer auth gate
- `/admin/events` lists configured events and creates draft events
- `/admin/events/:eventSlug/participants` shows participant reporting
- `/admin/events/:eventSlug/leads` shows submitted leads
- `/admin/events/:eventSlug/rewards` shows reward eligibility reporting
- `/admin/events/:eventSlug/export` downloads the leads CSV through the web
  server so the admin cookie remains backend-only
- the demo event is granted to the seeded demo organizer as `OWNER`

## Phase 6: UX And Mobile Polish

Status: in progress

Goal:

Make the app truly usable on a busy event floor.

Tasks:

- improve loading and empty states
- tighten task card spacing and hierarchy
- improve summary screen clarity for staff
- add stronger visual treatment for points and reward tiers
- test on real mobile screen sizes
- improve return flow after social link-outs

Output:

- the participant experience feels clear and fast on mobile
- staff can verify quickly without confusion
- current progress:
  - the summary screen now separates review, verified, and rejected states more clearly
  - the hidden verification screen is faster for booth use and preselects reviewable tasks
  - task detail screens now expose clearer proof expectations before claim actions

## Phase 7: Operational Readiness

Status: pending

Goal:

Make the first deployment usable for a real event.

Tasks:

- configure Render services
- connect managed Postgres
- configure environment variables
- define staff PIN management process
- define basic backup and recovery process
- define how daily draw data will be reviewed internally
- perform end-to-end testing on real devices

Output:

- first event deployment is ready for internal use

## MVP Definition

The MVP is complete when:

- an event can be created in the database
- a participant can scan or open the event route
- a participant session is created automatically
- the participant can complete social and form tasks
- the app shows live claimed progress
- the app shows a final summary screen
- staff can verify tasks with a PIN-protected flow
- staff can look up a participant by event-specific verification code from their own device
- verified rewards and daily draw eligibility are stored in backend

## Immediate Next Steps

These are the highest-priority tasks right now:

1. complete real Facebook app and Page webhook setup for the new automatic comment task
2. improve the hidden verification screen UX for faster booth use
3. make staff review faster with single-row approve and reject controls
4. prepare Render deployment config and first operational checklist
5. test social link-out return behavior on real phones

## Deferred Until After MVP

These should not block the first release:

- email-based login
- separate staff app
- analytics dashboard
- client self-service event management
- full multi-tenant organization support
- additional automated social verification providers beyond Facebook comments
- advanced prize draw tooling

## Automatic Social Verification

Progress on the first automatic social task:

- `SOCIAL_COMMENT` task type added for platform-aware comment tasks
- Facebook comment tasks can now move from `NOT_STARTED` to `PENDING_AUTO_VERIFICATION` to `VERIFIED`
- participant sessions use their existing event verification code inside the required comment text
- organizer task config now supports Facebook post URL, Facebook post ID, required prefix, and auto-verify settings
- organizers can now connect a per-event Facebook Page through Meta OAuth instead of relying on one global page token
- backend now exposes Facebook webhook verification and comment ingestion endpoints
- webhook processing stores deduplicated comment events and can auto-approve the matching task attempt
- participant task detail now shows the exact comment string and lets the participant mark the task as waiting for automatic verification
- reward recalculation still runs through the existing verified-points pipeline after automatic approval

## Recommended Working Rhythm

The cleanest execution order from here is:

1. data wiring
2. participant session flow
3. task submission flow
4. reward logic
5. staff verification
6. event configuration improvements
7. deployment and device testing

## Decision Log

Approved technical decisions:

- React Router v7 Framework mode
- Fastify
- REST
- Prisma
- Zod
- anonymous session token first
- email-based login later
- hidden staff confirm action with short PIN
- DB-backed configuration
- Tailwind CSS with CSS variables
- small internal component layer
- React Router loaders and actions
- Google Cloud Storage
- hosting-platform cron
- Render
- monorepo

## Suggested Next Artifact

The next useful planning artifact after this one would be:

- a backend API contract doc

That document would define the first real request and response shapes for:

- event lookup
- session creation
- task claim
- form submit
- summary fetch
- staff verification
