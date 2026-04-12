# Facebook Comment Verification

This is the first automatic social verification flow in the Qianlu Events app.

## How it works

1. An organizer creates a `SOCIAL_COMMENT` task on platform `FACEBOOK`.
2. The task stores:
   - `primaryUrl`: the Facebook post URL
   - `facebookPostId`: the Graph API post ID used for webhook lookup and fallback reads
   - `requiredPrefix`: the fixed prefix participants must use
   - `requireVerificationCode`: whether the participant session code must be included
   - `autoVerify`: whether the backend should verify the task automatically
3. Each participant already has an event-specific `verificationCode`.
4. The participant task detail screen builds the exact required comment text, for example `QIANLU AB12CD`.
5. When the participant taps `I've commented`, the task attempt moves to `PENDING_AUTO_VERIFICATION`.
6. The API first checks any stored Facebook webhook events for that task attempt.
7. If nothing is already stored, the API can fall back to the Facebook Graph API comments lookup for the configured post.
8. When a matching comment is found, the task attempt becomes `VERIFIED`, a verification action is recorded, and reward state is recalculated.

## Matching rules

- Matching is based on the participant session verification code, not on the participant's Facebook identity.
- The expected comment text is built from the configured prefix plus the participant code.
- Matching normalizes whitespace and casing before comparing.
- For the first version, the comment text is expected to match the generated string exactly after normalization.

## Webhook endpoints

- `GET /integrations/facebook/webhook`
  Used by Facebook webhook verification with `hub.mode`, `hub.verify_token`, and `hub.challenge`.
- `POST /integrations/facebook/webhook`
  Receives Page webhook events, verifies the signature when `FACEBOOK_APP_SECRET` is configured, parses comment events, and attempts automatic task verification.

## Platform environment variables

- `FACEBOOK_APP_ID`
- `FACEBOOK_LOGIN_CONFIGURATION_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_VERIFY_TOKEN`
- `API_BASE_URL`
- `WEB_BASE_URL`

Keep these Meta app values server-side only.

## Per-event Facebook connection

Each client event should store its own Facebook Page connection in the database:

- Facebook Page ID
- Facebook Page name
- Facebook Page access token

The organizer task screen now starts a Meta OAuth flow, then lets the organizer
pick one of the Facebook Pages returned by Meta for that event. The selected
Page ID and Page access token are stored server-side for that event. Task-level
Facebook post settings still live in the task config itself.

## Facebook setup checklist

1. Create or use a Meta app with Facebook Login / Graph access as required for Page webhooks.
2. In `Facebook Login for Business -> Configurations`, copy the configuration ID and set it as `FACEBOOK_LOGIN_CONFIGURATION_ID` on the API.
3. Subscribe the app to the Page webhook feed events needed for Page comments.
4. Set the callback URL to the deployed `GET/POST /integrations/facebook/webhook` endpoints.
5. Set the verify token to the same value as `FACEBOOK_VERIFY_TOKEN`.
6. Set `WEB_BASE_URL` so the API callback can redirect organizers back to the admin UI after Meta login.
7. In `Facebook Login for Business`, make sure the configuration requests:
   - `business_management`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_metadata`
8. Use the `Connect Facebook Page` button in the event task screen and finish the Meta login flow.
9. If Meta returns multiple Pages, choose the correct Page in the organizer UI.
10. Use the Graph API post ID from the target Facebook post in the task config.

## Safety and idempotency

- Incoming Facebook comments are stored in `SocialCommentVerification`.
- The table keeps the external comment ID, matched task/session/attempt references, and the raw payload for auditability.
- Duplicate webhook deliveries for the same Facebook comment reuse the same record and do not create duplicate approvals.
- Organizer OAuth state is stored in `AdminFacebookOAuthState` so callback state and pending page selection stay server-side.

## Current limitations

- The first version only supports Facebook Page comment tasks.
- The fallback Graph lookup reads comments for one configured Facebook post at a time.
- Matching currently assumes a single verification code token after the configured prefix.
- Local development can simulate webhook delivery, but real end-to-end verification still requires a properly configured Meta app, Page subscription, and access token.
