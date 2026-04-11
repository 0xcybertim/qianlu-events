import { randomInt } from "node:crypto";

import { prisma } from "./prisma.js";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function normalizeVerificationCode(code: string) {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

function createVerificationCode(length = 6) {
  return Array.from({ length }, () =>
    CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)],
  ).join("");
}

export async function createUniqueVerificationCode(eventId: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = createVerificationCode(attempt < 10 ? 6 : 8);
    const existingSession = await prisma.participantSession.findFirst({
      where: {
        eventId,
        verificationCode: code,
      },
      select: {
        id: true,
      },
    });

    if (!existingSession) {
      return code;
    }
  }

  throw new Error("Could not generate a unique verification code.");
}
