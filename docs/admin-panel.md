# Organizer Admin Panel

## Scope

The v1 organizer panel is an internal setup and reporting tool. It is separate
from the event-day staff verification panel.

Organizer routes live under `/admin`:

- `/admin`
- `/admin/events`
- `/admin/events/:eventSlug`
- `/admin/events/:eventSlug/tasks`
- `/admin/events/:eventSlug/qr-codes`
- `/admin/events/:eventSlug/participants`
- `/admin/events/:eventSlug/leads`
- `/admin/events/:eventSlug/rewards`
- `/admin/events/:eventSlug/export`

## Authentication

The organizer panel uses database-backed admin accounts. Login is email and
password at `POST /admin/auth/login`, which creates an `AdminSession` and
returns an httpOnly admin cookie. React Router server loaders and actions
forward that cookie to the API for protected admin requests.

Seed the demo organizer with:

- `DEMO_ADMIN_EMAIL`
- `DEMO_ADMIN_PASSWORD`

If these are not set, the seed uses `organizer@example.com` and `change-me`.
Do not reuse `STAFF_PIN` for admin access.

## Event Access

Organizer access is scoped directly to events through `AdminEventAccess`.

Roles:

- `OWNER`: can access the event and mutate setup. Reserved for future access
  management.
- `EDITOR`: can access the event and mutate setup.
- `VIEWER`: can access reports and exports.

The demo seed grants the demo organizer `OWNER` access to `demo-event`.

## Event Setup

The event overview supports:

- event name
- immutable slug for v1
- status: `DRAFT`, `PUBLISHED`, `ARCHIVED`
- branding colors
- enabled reward types
- reward tier keys, labels, and thresholds

The task page supports:

- create task
- edit task
- soft-disable task
- sort order
- active/inactive state
- verification requirements
- task config URLs, CTA labels, and proof hints

The QR codes page shows:

- a generator form for creating QR codes from `STAMP_SCAN` tasks
- configured QR code records for the event
- whether each code is running now
- linked stamp task
- validity window
- scan limit and cooldown settings
- accepted, duplicate, expired, inactive, and wrong-event scan counts
- rendered QR images for codes that have a stored public token

## Reporting

The participants page shows session-level score and eligibility state:

- verification code
- name and email
- claimed and verified points
- reward tier
- instant reward eligibility
- daily draw eligibility
- task status counts
- created and updated timestamps

The leads page shows submitted lead-like tasks:

- `LEAD_FORM`
- `NEWSLETTER_OPT_IN`
- `WHATSAPP_OPT_IN`

The rewards page shows:

- instant reward eligible count
- daily draw eligible count
- tier claimed/verified counts
- daily draw eligible participant list

## Export

The first export is a leads CSV at:

- `/admin/events/:eventSlug/export`

The web route proxies the API CSV response so browser downloads keep using the
httpOnly admin cookie that belongs to the web app origin.

## Limitations

- No organizer invite or password reset flow yet.
- No UI for managing event access yet.
- No audit log for organizer edits yet.
- Slugs are immutable from the UI for v1.
- Legacy QR code records without `publicToken` cannot be rendered because their
  original tokens cannot be reconstructed from hashes.
- CSV export currently covers leads only.
- Prize draw winner selection is not implemented yet.
