# Instagram Comment Verification

Instagram comment verification uses the same end-to-end social comment
auto-verification flow as Facebook:

1. An organizer creates a `SOCIAL_COMMENT` task on platform `INSTAGRAM`.
2. The task stores:
   - `primaryUrl`: the Instagram media permalink
   - `instagramMediaId`: the Graph API media ID used for webhook matching and fallback reads
   - `requiredPrefix`: the fixed prefix participants must use
   - `requireVerificationCode`: whether the participant session code must be included
   - `autoVerify`: whether the backend should verify the task automatically
3. The participant task screen builds the exact required comment text.
4. When the participant taps `I've commented`, the task attempt moves to
   `PENDING_AUTO_VERIFICATION`.
5. The API first checks stored Instagram webhook events for a matching pending
   attempt.
6. If nothing has matched yet, the API falls back to `GET /<IG_MEDIA_ID>/comments`.
7. When a matching comment is found, the attempt becomes `VERIFIED`,
   `VerificationAction` is recorded, `SocialCommentVerification` is updated, and
   reward recalculation continues unchanged.

## Required Meta permissions

This implementation follows the Facebook Login for Instagram path, not standalone
Instagram Login.

Required permissions/scopes:

- `instagram_basic`
- `instagram_manage_comments`
- `pages_manage_metadata`
- `pages_read_engagement`
- `pages_show_list`
- `business_management` may still be required in Business Manager-managed setups

For real production delivery, Meta also requires:

- App mode set to Live
- Advanced Access for `comments`
- Advanced Access for `live_comments` if you choose to enable that later

## Account conditions

Instagram comment auto-verification only works when:

- the connected Instagram account is a professional account
- the professional account is linked to a Facebook Page
- the connected Facebook user can access that Page strongly enough for Meta to
  return a Page access token
- the Instagram account owns the media configured in the task
- the Instagram professional account is public if you expect comment or mention
  webhook delivery from Meta

The admin UI should treat any missing Page token, missing linked Instagram
account, or missing professional/public setup as a configuration problem rather
than a participant issue.

## Webhooks

Endpoints:

- `GET /integrations/instagram/webhook`
- `POST /integrations/instagram/webhook`

The webhook route follows the same verify-token and signature discipline already
used for Facebook.

The event connection flow subscribes the Page token through:

- `POST /me/subscribed_apps?subscribed_fields=comments`

`live_comments` is not required for the current implementation.

## Fallback lookup

If webhook delivery is delayed or missing, the API reconciles using:

- `GET /<IG_MEDIA_ID>/comments`

Webhook payloads and fallback matches both upsert into
`SocialCommentVerification` using `(platform, externalCommentId)` for
idempotency, so duplicate deliveries or repeated polling do not create duplicate
approvals.

## Event connection storage

Each event stores its own Instagram connection in `EventInstagramConnection`.
That record keeps:

- linked Facebook Page ID / name
- linked Instagram professional account ID / username
- Page access token used for Graph API calls
- token expiry metadata where available

Organizer OAuth state is stored server-side in `AdminInstagramOAuthState`.

## Environment variables

No new Instagram-only environment variables were added. Instagram uses the same
Meta app settings already required for Facebook Login:

- `FACEBOOK_APP_ID`
- `FACEBOOK_LOGIN_CONFIGURATION_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_VERIFY_TOKEN`
- `API_BASE_URL`
- `WEB_BASE_URL`

## Product limitations

- Only Instagram professional accounts are supported.
- The media owner must be the connected professional account.
- Automatic matching still assumes one exact generated comment string after
  whitespace/case normalization.
- Local development can exercise the API and fallback logic, but real webhook
  delivery still depends on Meta app review, Live mode, and a reachable public
  callback URL.
