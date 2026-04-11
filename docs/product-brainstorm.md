# Qianlu Events Product Brainstorm

## Working Concept

Build a mobile web app for live events where visitors scan an event-specific QR code, complete branded tasks, earn points, and qualify for rewards.

The initial use case is for our own events, but the system should be designed so other companies can use it later. The product should therefore be structured as a reusable event-task platform rather than a one-off campaign page.

## Core Product Idea

Visitors scan a QR code and land on a mobile-first event page. On that page they can complete tasks such as following social accounts, liking posts, sharing content, filling out a form, answering short questions, joining a newsletter or WhatsApp group, referring a friend, or showing a photo from the event.

Each task has a point value. Different tasks can be worth different amounts. The app should also support bonus logic, such as a reward for completing all key social platforms or a combo reward for doing both social actions and lead-generation actions.

After completing tasks, the visitor shows their phone to staff. Staff can quickly see what the visitor claims to have completed and what reward level they qualify for. Instant rewards require staff verification. Daily prize draws require backend support and stored entries.

## Product Goals

- Increase social growth across Instagram, Facebook, and TikTok
- Generate leads during events
- Create a simple, high-conversion QR-to-action flow
- Make staff verification fast and easy on the event floor
- Support multiple reward models
- Be reusable for future events and eventually for other companies

## Non-Goals For V1

- Full automation or API-level verification of social actions
- A full staff admin dashboard
- A multi-tenant company management portal
- Complex gamification mechanics beyond tasks, points, and rewards

## Target User Flow

1. Visitor scans an event-specific QR code
2. Visitor lands on the mobile event page
3. Visitor sees large task buttons and current task states
4. Visitor completes tasks one by one
5. Visitor sees points, progress, and unlocked rewards
6. Visitor shows final screen to staff
7. Staff verifies completed tasks for any instant reward
8. Backend stores eligible entries for daily prize draw

## Supported Task Ideas

These are the task types we want to support:

- Follow on Instagram
- Follow on Facebook
- Follow on TikTok
- Like a specific post
- Share a post or story
- Sign up with name and email
- Answer 2 to 3 short brand questions
- Join WhatsApp or newsletter
- Refer a friend at the booth
- Upload or show a photo taken at the event

## Point System

The system should support flexible scoring per task.

Example starting model:

- 1 point for a basic social follow
- 2 points for a like, share, or similar engagement action
- 3 points for a form completion or higher-intent action
- Bonus points for completing Instagram, Facebook, and TikTok
- Bonus points for completing both social tasks and lead tasks

The exact points should be configurable per event.

## Reward Models To Support

The system should be built to support all of the following:

### 1. Instant Rewards

Visitors can qualify for an immediate reward at the booth, but only after staff verification. No trust should be placed in self-reported completion for instant rewards.

### 2. Daily Prize Draw

Verified tasks can create entries into a daily draw. This requires backend support so entries are stored and later used for the prize selection process.

### 3. Tiered Rewards

Visitors unlock rewards based on point thresholds.

Initial example:

- Small reward at 3 points
- Better reward at 6 points

These thresholds should be configurable.

## Verification Principles

### Trust Model

For instant rewards, self-reported completion is not enough. Staff must verify.

For raffle or draw entries, the backend must store what was completed, what was verified, and what reward logic applied.

### Suggested Task Statuses

- Not started
- In progress
- Completed by user
- Pending staff check
- Verified
- Rejected

### Verification UX

The visitor-facing summary screen should clearly show:

- Total points
- Completed tasks
- Pending tasks
- Verified tasks
- Reward tier unlocked
- Eligibility for instant reward or daily draw
- Timestamp or session marker
- Unique visual marker or code for quick checking

## UX Principles

The app should be optimized for fast use at busy live events.

### Required UX Ideas

- Large touch-friendly buttons
- Clear task status on every item
- Live total points at the top
- Progress indicator such as completed tasks out of total tasks
- Strong final summary screen that the visitor can show to staff

### Design Direction

- Mobile-first only for the main participant experience
- Very low friction
- Clear event branding
- Minimal text where possible
- Fast load from QR scan
- Obvious calls to action

## Event-Specific Requirements

- Each event must have its own QR code
- Each event should be able to have its own branding
- Each event should be able to define its own task list
- Each event should be able to define its own points and reward rules

## Lead Generation Requirements

The product should support both social growth and lead capture.

Initial lead-related task examples:

- Name and email submission
- Newsletter opt-in
- WhatsApp opt-in
- Short brand survey

The system should be built so more lead-generation task types can be added later.

## Platform Vision

Even though v1 is for our own event, the product should be structured so it can evolve into a reusable platform for other companies.

### Future Platform Characteristics

- Multi-event architecture
- Configurable task templates
- Configurable point rules
- Configurable reward rules
- Event-level branding
- Event-level QR codes
- Backend audit trail for verification decisions
- Support for multiple clients or brands in the future

## Architecture Direction

The product should be implemented as a single platform with clear separation between reusable platform logic and event-specific configuration.

### Recommended Setup Direction

- One codebase for all events
- Event configuration drives branding, tasks, points, and reward rules
- Backend stores sessions, task attempts, verification states, and reward eligibility
- Public mobile participant experience is event-specific
- Admin and staff tooling can be added later on top of the same backend

### Future Multi-Company Readiness

Even if v1 is used only by Qianlu Events, the data model should be compatible with future support for multiple organizations.

That means keeping room for concepts such as:

- organization
- brand
- event
- user or staff member
- participant session
- verification records

The first release does not need full multi-tenant functionality, but it should avoid hard-coding the app around a single event or single company.

## Recommended Domain Model

The product can be modeled around a few core concepts:

### Event

Represents a specific event or campaign.

Fields may include:

- id
- name
- slug
- brand
- QR code identifier
- start and end date
- theme or branding settings
- reward configuration

### Task

Represents an action a visitor can complete during an event.

Fields may include:

- id
- event id
- title
- description
- type
- platform
- points
- verification method
- reward eligibility
- display order
- active flag

### Participant Session

Represents a visitor’s progress for a specific event interaction.

Fields may include:

- id
- event id
- anonymous session id or participant id
- created at
- current point total
- current reward tier
- completion state

### Task Attempt

Represents a participant’s completion state for one task.

Fields may include:

- id
- participant session id
- task id
- status
- completed at
- verified at
- verified by
- proof notes

### Reward Rule

Defines how rewards are unlocked.

Fields may include:

- id
- event id
- type
- threshold
- bonus logic
- verification requirements

### Reward Entry

Represents a specific earned eligibility item.

Fields may include:

- id
- participant session id
- reward type
- created at
- eligible
- verified
- metadata

## Suggested MVP Scope

### Include In MVP

- Event-specific QR landing page
- Mobile-first participant flow
- All agreed task types represented in the system
- Configurable point values
- Bonus point support
- Participant progress screen
- Final verification summary screen
- Backend persistence for sessions and task states
- Support for instant rewards, daily draw entries, and tiered rewards in the data model

### Defer From MVP

- Full staff admin panel
- Full client self-service event builder
- Social API integrations for automatic proof verification
- Advanced analytics dashboards
- Multi-tenant billing or account management

## Open Questions

These need decisions later but should be kept in mind now:

- How should staff verification happen in v1: visual check only or some lightweight staff action as well?
- Do we want participants to identify themselves immediately or only when they complete lead tasks?
- How should referral tasks be verified at the booth?
- How should photo tasks be handled: upload to the system, or only show to staff?
- How should daily prize draw winners be selected and audited?
- Should visitors be allowed to come back later to the same event session?

## Initial Product Positioning

Short version:

"A mobile event engagement platform where visitors scan a QR code, complete social and lead tasks, earn points, and unlock rewards."

Longer version:

"A reusable event-task platform for brands and event teams that turns QR scans into measurable actions such as follows, shares, signups, and verified reward participation."

## Recommended Next Steps

1. Turn this brainstorm into a v1 product specification
2. Define the participant user flow screen by screen
3. Define the verification flow for staff
4. Design the initial data model and backend architecture
5. Choose the technical stack for the mobile web app and backend
