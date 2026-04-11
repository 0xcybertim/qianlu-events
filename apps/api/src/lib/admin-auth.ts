import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const passwordHashVersion = "scrypt-v1";

function timingSafeStringEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function hashAdminSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function createAdminSessionToken() {
  return randomBytes(32).toString("base64url");
}

export async function hashAdminPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return `${passwordHashVersion}:${salt}:${derivedKey.toString("base64url")}`;
}

export async function verifyAdminPassword(
  password: string,
  passwordHash: string,
) {
  const [version, salt, storedHash] = passwordHash.split(":");

  if (version !== passwordHashVersion || !salt || !storedHash) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return timingSafeStringEqual(derivedKey.toString("base64url"), storedHash);
}
