# Render Deployment

## Recommended architecture

Use three Render resources:

1. `qianlu-events-web`
   React Router v7 framework-mode web service
2. `qianlu-events-api`
   Fastify API web service
3. `qianlu-events-db`
   Render Postgres database

This keeps the API publicly reachable for Meta OAuth callbacks and Facebook
webhooks, while keeping the frontend and backend deploys separate and simple.

## What the blueprint does

The repo now includes `render.yaml` with:

- two Node web services
- one Postgres database
- `/health` health checks for both services
- API Prisma client generation during build
- `prisma migrate deploy` as the API pre-deploy command
- automatic URL wiring between services via `RENDER_EXTERNAL_URL`

Important behavior:

- `WEB_BASE_URL` on the API is populated from the web service URL
- `API_BASE_URL` and `VITE_API_BASE_URL` on the web service are populated from
  the API service URL
- the API can fall back to its own `RENDER_EXTERNAL_URL` for
  `API_BASE_URL` if no explicit override is set
- the Facebook OAuth start flow now goes through the web app first, so admin
  cookies still work when the web and API use different Render domains

## Manual setup on Render

1. Push the repo with this `render.yaml`.
2. In Render, create a new Blueprint from the repo.
3. Keep the default service names unless you want different public URLs:
   - `qianlu-events-web`
   - `qianlu-events-api`
   - `qianlu-events-db`
4. When Render prompts for API secrets, enter:
   - `STAFF_PIN`
   - `DEMO_ADMIN_EMAIL`
   - `DEMO_ADMIN_PASSWORD`
   - `FACEBOOK_APP_ID`
   - `FACEBOOK_LOGIN_CONFIGURATION_ID`
   - `FACEBOOK_APP_SECRET`
   - `FACEBOOK_VERIFY_TOKEN`
5. Deploy the Blueprint.
6. After the first API deploy succeeds, open the Render Shell for
   `qianlu-events-api` and run:

   ```bash
   npm run db:seed
   ```

7. Open the web app and log in at `/admin` with `DEMO_ADMIN_EMAIL` and
   `DEMO_ADMIN_PASSWORD`.

## Render environment variables

### API service

Set by the blueprint:

- `DATABASE_URL`
- `WEB_BASE_URL`
- `DEMO_WEB_BASE_URL`
- `STAFF_PIN`
- `DEMO_ADMIN_EMAIL`
- `DEMO_ADMIN_PASSWORD`
- `FACEBOOK_APP_ID`
- `FACEBOOK_LOGIN_CONFIGURATION_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_VERIFY_TOKEN`

Resolved automatically by app code on Render:

- `API_BASE_URL`
  Falls back to the API service `RENDER_EXTERNAL_URL`

### Web service

Set by the blueprint:

- `API_BASE_URL`
- `VITE_API_BASE_URL`
- `HOST`

Resolved automatically by Render:

- `PORT`
- `RENDER_EXTERNAL_URL`

## Exact Meta values to enter

If you keep the default Blueprint service names, use:

- Web app URL:
  `https://qianlu-events-web.onrender.com`
- API URL:
  `https://qianlu-events-api.onrender.com`
- Facebook OAuth callback URL:
  `https://qianlu-events-api.onrender.com/admin/integrations/facebook/callback`
- Facebook webhook callback URL:
  `https://qianlu-events-api.onrender.com/integrations/facebook/webhook`

If you rename either service, replace the base URL with the actual Render
service URL shown in the dashboard.

Use this same webhook callback URL in Meta Webhooks:

- `https://<your-api-render-url>/integrations/facebook/webhook`

Use this same OAuth callback URL in Meta Facebook Login settings:

- `https://<your-api-render-url>/admin/integrations/facebook/callback`

Use the exact `FACEBOOK_VERIFY_TOKEN` value from Render as the Meta webhook
verify token.

## Meta configuration checklist

1. Open your Meta app.
2. Add the Facebook Login product if it is not already enabled.
3. Add the Webhooks product.
4. Under Facebook Login, add this Valid OAuth Redirect URI:
   - `https://<your-api-render-url>/admin/integrations/facebook/callback`
5. Under Webhooks, choose the `Page` object.
6. Set the callback URL to:
   - `https://<your-api-render-url>/integrations/facebook/webhook`
7. Set the verify token to the exact `FACEBOOK_VERIFY_TOKEN` value from
   Render.
8. Subscribe the app to the Page `feed` field so comment events are delivered.
9. In the Qianlu admin UI, open the event task page and use `Connect Facebook
   Page` to complete organizer OAuth and save the event-specific Page
   connection.
10. If the Page is inside a Meta business portfolio, ensure the connecting
    organizer has Page-level tasks / role access so Meta can return a Page
    access token after discovery.

## Redeploy behavior

- Web deploys rebuild the React Router app only.
- API deploys rebuild the Fastify bundle and run `prisma migrate deploy`
  before the new instance goes live.
- The demo seed is intentionally manual so production deploys do not rewrite
  app data on every release.
