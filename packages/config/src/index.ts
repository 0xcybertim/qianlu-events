import { z } from "zod";
import { timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "qianlu_events_session";
export const ADMIN_SESSION_COOKIE_NAME = "qianlu_events_admin";

const apiConfigSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.coerce.number().int().positive().default(3001),
});

const staffPinConfigSchema = z.object({
  pin: z.string().min(4).default("1234"),
});

const facebookConfigSchema = z.object({
  appId: z.string().trim().min(1).optional(),
  appSecret: z.string().trim().min(1).optional(),
  verifyToken: z.string().trim().min(1).optional(),
});

export function getApiConfig() {
  return apiConfigSchema.parse({
    host: process.env.API_HOST,
    port: process.env.API_PORT ?? process.env.PORT,
  });
}

export function getStaffPinConfig() {
  return staffPinConfigSchema.parse({
    pin: process.env.STAFF_PIN,
  });
}

export function getFacebookConfig() {
  return facebookConfigSchema.parse({
    appId: process.env.FACEBOOK_APP_ID,
    appSecret: process.env.FACEBOOK_APP_SECRET,
    verifyToken: process.env.FACEBOOK_VERIFY_TOKEN,
  });
}

function timingSafeStringEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function isValidStaffPin(candidate: string) {
  const configured = getStaffPinConfig().pin;

  return timingSafeStringEqual(candidate, configured);
}
