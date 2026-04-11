# Qianlu Events V1 Product Spec

## Purpose

This document turns the product brainstorm into a concrete v1 scope for implementation.

V1 is a mobile-first event web app for Qianlu Events. Visitors scan an event-specific QR code, complete tasks, earn points, unlock reward tiers, and show their phone to staff for verification.

The product should be built as a reusable event-task platform, even though the first release is only for our own event.

## Product Summary

Qianlu Events V1 is a QR-driven mobile event experience with:

- Event-specific landing pages
- Configurable tasks and points
- Progress tracking per participant session
- Reward logic for instant rewards, tiered rewards, and daily prize draw entries
- Staff-facing verification through the participant’s phone screen
- Backend storage for sessions, task claims, verification, and reward eligibility

## V1 Goals

- Drive social growth on Instagram, Facebook, and TikTok
- Capture leads during events
- Create a fast mobile experience that works on the event floor
- Let staff verify claimed tasks quickly
- Store enough data to support daily prize draws
- Build the system in a way that can expand to more events and brands later

## V1 Non-Goals

- Automated verification through social platform APIs
- A full staff dashboard
- A client self-service dashboard
- A multi-tenant billing or account system
- Advanced analytics and reporting
- Native mobile apps

## Primary Users

### Participant

A visitor at the event who scans the QR code, completes tasks, and wants to qualify for rewards.

### Event Staff

A staff member who checks the participant’s phone and decides whether claimed tasks are valid for instant reward verification.

### Internal Admin

Not a v1 product user in the UI sense, but an internal operator who sets up the event, tasks, and reward logic in the backend or config.

## Core Product Principles

- Mobile-first and event-floor friendly
- Very low friction from QR scan to first action
- Big buttons and obvious status states
- Clear participant progress
- Staff verification must be quick
- No trust in self-reported instant reward completion
- Event-specific setup should come from configuration, not hard-coded screens

## Core V1 Use Case

1. A participant scans an event-specific QR code
2. They land on a branded event page
3. They see available tasks with points and current status
4. They complete tasks one by one
5. They submit task completion claims
6. The app shows total points and unlocked reward tiers
7. The participant shows the summary screen to staff
8. Staff visually verifies claimed tasks
9. The backend stores verification outcomes and reward eligibility

## Supported Task Types In V1

V1 should support these task types in the product model and participant experience:

- Follow Instagram account
- Follow Facebook account
- Follow TikTok account
- Like a specific post
- Share a post or story
- Submit name and email
- Answer 2 to 3 short brand questions
- Join WhatsApp or newsletter
- Refer a friend at the booth
- Show a photo taken at the event

Not every task type needs fully unique UX on day one. Some can share common interaction patterns.

## Task Interaction Model

Each task in v1 should follow one of these interaction patterns:

### Link-Out Task

Used for social tasks such as follow, like, or share.

Participant behavior:

- Taps the task
- Sees short instructions
- Opens the target social link
- Returns to the app
- Marks the task as completed

System behavior:

- Task moves to `Completed by user`
- Task may require staff verification before it counts for instant rewards

### Form Task

Used for lead capture, signup, and short question tasks.

Participant behavior:

- Opens the task
- Fills out fields
- Submits the form

System behavior:

- Task is recorded in backend immediately
- Task moves to `Completed by user`
- Task can still require staff verification depending on event rules

### Booth Validation Task

Used for tasks that need an in-person proof step such as referral or showing an event photo.

Participant behavior:

- Reads the task instruction
- Completes the real-world action
- Marks the task ready for review

System behavior:

- Task moves to `Pending staff check`
- Final decision happens during staff verification

## Task Status Model

V1 should use a clear, shared task state model:

- `Not started`
- `In progress`
- `Completed by user`
- `Pending staff check`
- `Verified`
- `Rejected`

Interpretation:

- `Completed by user` means the participant claims they finished the task
- `Pending staff check` means the task still needs a booth-side verification step
- `Verified` means the task is accepted for reward calculation where verification is required
- `Rejected` means the task was reviewed and not accepted

## Points Model

V1 must support:

- Different point values per task
- Event-specific point configuration
- Bonus point rules

Initial default point assumptions:

- 1 point for a basic social follow
- 2 points for a like, share, or similar engagement task
- 3 points for form completion or higher-intent actions

Initial default bonus assumptions:

- Bonus for completing Instagram, Facebook, and TikTok
- Bonus for completing both social tasks and lead tasks

The values themselves must be configurable.

## Reward Model

V1 should support three reward models in the backend and participant messaging.

### 1. Instant Reward

- Earned only after required tasks are verified by staff
- Never based on self-report alone
- May be linked to a threshold, task combination, or verified point total

### 2. Tiered Reward

- Based on points
- Initial example:
  - 3 points unlock small reward
  - 6 points unlock better reward
- Thresholds must be configurable per event

### 3. Daily Prize Draw

- Eligible entries are stored in backend
- Entry logic can depend on verified tasks, verified points, or configured completion rules
- Winner selection workflow is out of scope for v1 UI, but the data must support it

## Verification Rules

### Trust Rule

Self-reported task completion is not enough for instant rewards.

### V1 Verification Method

V1 will rely on visual staff verification using the participant’s phone and the relevant social app or proof on that phone.

Examples:

- Staff sees that the brand account has been followed
- Staff sees the liked or shared post
- Staff checks the filled form confirmation
- Staff confirms the participant showed the event photo

### Staff Tooling In V1

There is no separate staff admin app in v1.

Instead, the participant app must provide a verification-ready summary screen that staff can inspect quickly, plus a hidden staff verification action protected by a short staff PIN.

### Verification Result Handling

When a task requires staff verification:

- It should not count for instant reward eligibility until verified
- It may be displayed as claimed but unverified
- The backend should store the verification result once recorded

### Session Model In V1

V1 will use an anonymous participant session token as the default session model.

Lead information such as name and email can be collected through task flows and attached to the session. Email-based login may be added later, but it is not required for v1 participation.

## Participant Experience

### Screen 1: Event Landing Screen

Purpose:

- Confirm the participant is at the right event
- Explain the reward concept
- Give a strong start button or direct task list access

Must show:

- Event name
- Event branding
- Short explanation of how to participate
- Current reward teaser
- Primary CTA

### Screen 2: Task List Screen

Purpose:

- Show all available tasks clearly
- Encourage completion
- Make progress visible

Must show:

- Large task buttons or cards
- Task title
- Point value
- Task status
- Current total points
- Progress indicator
- Reward tier progress

Should support:

- Sorting by recommended order
- Clear distinction between completed, pending, and verified

### Screen 3: Task Detail / Action Screen

Purpose:

- Help participant complete a specific task

Must support:

- Short instruction copy
- External links for social tasks
- Simple form UX for lead tasks
- Claim action or submit action
- Return path back to task list

### Screen 4: Completion / Verification Summary Screen

Purpose:

- Let the participant show their final progress to staff
- Give staff a fast decision surface

Must show:

- Participant session summary
- Total points
- Claimed tasks
- Verified tasks
- Pending staff check tasks
- Current reward tier
- Instant reward eligibility status
- Daily prize draw eligibility status
- Timestamp or session indicator
- Event identifier

Should show:

- A bold visual confirmation card
- A unique code or session token for quick reference

## UX Requirements

### Required

- Fully mobile-first layout
- Very large touch targets
- Fast loading on mobile networks
- Clear visual status system
- Minimal copy
- Strong CTA hierarchy
- No confusing navigation

### Nice To Have In V1 If Low Effort

- Subtle progress animation
- Sticky point total
- Clear visual tier unlock feedback
- Multi-language readiness in content structure

## Event Configuration Requirements

Each event should be configurable through data or backend records, not through code edits to the participant flow.

Event config should support:

- Event name
- Slug or URL path
- Event status
- Brand colors and assets
- QR code mapping
- Task list
- Task order
- Point values
- Bonus rules
- Reward rules
- Copy shown on landing and summary screens

## Backend Requirements

The backend is required in v1 because the product must support lead capture, persistent progress, and daily draw eligibility.

### Backend Must Store

- Events
- Tasks
- Participant sessions
- Form submissions
- Task claims
- Verification states
- Reward eligibility records

### Backend Must Support

- Event lookup from QR entry route
- Session creation
- Session persistence across page refresh
- Task submission and task claim updates
- Reward calculation
- Verification result storage
- Data export or retrieval for internal operations later

## Suggested V1 Data Model

### Event

Fields:

- id
- name
- slug
- organization id placeholder
- status
- starts at
- ends at
- branding config
- reward config

### Task

Fields:

- id
- event id
- type
- platform
- title
- description
- points
- sort order
- requires verification
- verification type
- config payload
- active

### Participant Session

Fields:

- id
- event id
- anonymous token
- participant name optional
- participant email optional
- current points
- verified points
- reward tier
- created at
- updated at

### Task Attempt

Fields:

- id
- participant session id
- task id
- status
- user completed at
- verification required
- verified at
- verification result
- proof metadata

### Reward Eligibility

Fields:

- id
- participant session id
- reward type
- reward code
- eligible
- eligibility reason
- verification required
- verified
- created at

## Reward Calculation Rules

V1 should separate:

- claimed points
- verified points

Why:

- Participants need to see progress quickly
- Instant rewards cannot rely on unverified claims
- Daily draw logic may depend on verification rules

Recommended behavior:

- Task list can show claimed progress immediately
- Reward messaging must clearly separate claimed and verified states where needed
- Final summary screen should show whether the participant is eligible now or still awaiting staff check

## QR Code Behavior

Each event will have its own QR code.

Recommended route pattern:

- `/{event-slug}`

Optional future support:

- per-campaign codes
- per-booth codes
- per-staff codes

V1 only needs event-specific codes.

## Lead Capture Rules

V1 should capture lead data through explicit participant actions such as form tasks and opt-ins.

Requirements:

- Clear consent wording where needed
- Form data tied to participant session
- Support for name and email
- Support for opt-in fields
- Support for short brand questions

## Reporting Requirements For V1

No analytics dashboard is required in v1, but the system must preserve enough data for later reporting.

Minimum useful output later should include:

- Number of sessions per event
- Number of completed tasks by type
- Number of verified tasks by type
- Number of leads collected
- Number of instant reward qualifiers
- Number of daily draw eligible entries

## Security And Abuse Considerations

V1 should assume abuse is possible and reduce obvious weak points.

Minimum safeguards:

- Event-specific sessions
- Session token stored per participant
- No direct trust in self-claimed social completion
- Backend validation on form submissions
- Rate limiting if feasible
- Clear distinction between claimed and verified states

## Platform Readiness Beyond V1

Even though v1 is single-company in use, the implementation should keep room for:

- multiple organizations
- multiple brands
- multiple concurrent events
- reusable task templates
- future staff app or admin portal

This does not need to be exposed in the UI yet, but the system should not block it.

## Open Product Decisions

These still need a decision before build details are finalized:

- Will a participant be able to resume the same session later on the same phone?
- What exact reward logic should be active at the first launch event?
- Which tasks are mandatory to verify versus optional to verify?
- What exact copy and branding should be used on the landing page?

## Recommended V1 Build Sequence

1. Define the technical stack
2. Implement event routing and event configuration
3. Build participant session creation and persistence
4. Build the task list and task detail flows
5. Add form tasks and social link-out tasks
6. Add point calculation and reward logic
7. Build the final verification summary screen
8. Add backend storage for draw eligibility and verification states

## Acceptance Criteria

V1 is successful when:

- A participant can scan an event QR code and land on the correct event page
- A participant can see all configured tasks with points and statuses
- A participant can complete both social and form-based tasks
- The app tracks claimed progress within a participant session
- The app calculates points and reward tier progress
- The app shows a staff-friendly summary screen
- The backend stores sessions, task attempts, and reward eligibility
- The event can be configured without rebuilding core product logic
