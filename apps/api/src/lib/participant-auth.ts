import { createHash, randomBytes } from "node:crypto";

export function createParticipantLoginToken() {
  return randomBytes(32).toString("base64url");
}

export function hashParticipantLoginToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function buildParticipantLoginUrl(args: {
  eventSlug: string;
  token: string;
}) {
  const baseUrl =
    process.env.WEB_BASE_URL ?? process.env.DEMO_WEB_BASE_URL ?? "http://localhost:5173";
  const url = new URL(
    `/${encodeURIComponent(args.eventSlug)}/account/verify`,
    baseUrl,
  );

  url.searchParams.set("token", args.token);

  return url.toString();
}
