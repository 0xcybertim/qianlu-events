import "dotenv/config";

import { createHash, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);
const demoWebBaseUrl =
  process.env.DEMO_WEB_BASE_URL ?? "http://localhost:5173";
const demoAdminEmail =
  process.env.DEMO_ADMIN_EMAIL ?? "organizer@example.com";
const demoAdminPassword =
  process.env.DEMO_ADMIN_PASSWORD ?? "change-me";

const branding = {
  primary: "#0f6d53",
  primaryContrast: "#f5f8f1",
  secondary: "#f2c66f",
  surface: "#f6efe5",
  surfaceStrong: "#fffaf3",
  text: "#162216",
  border: "#d6dccd",
};

const rewardTiers = [
  { key: "starter", label: "Starter reward", threshold: 3 },
  { key: "premium", label: "Premium reward", threshold: 6 },
];

const tasks: Prisma.TaskCreateManyEventInput[] = [
  {
    type: "SOCIAL_FOLLOW",
    platform: "INSTAGRAM",
    title: "Follow us on Instagram",
    description: "Open our Instagram page, follow the account, then return here.",
    points: 1,
    sortOrder: 1,
    configJson: {
      primaryUrl: "https://www.instagram.com/qianlu.events/",
      primaryLabel: "Open Instagram profile",
      proofHint: "Show the Following state on the brand profile to staff.",
    },
  },
  {
    type: "SOCIAL_COMMENT",
    platform: "FACEBOOK",
    title: "Comment on our Facebook post",
    description:
      "Open the Facebook post, comment the exact code shown in the task, and wait for automatic verification.",
    points: 1,
    sortOrder: 2,
    requiresVerification: true,
    verificationType: "AUTOMATIC",
    configJson: {
      primaryUrl: "https://www.facebook.com/qianluevents/posts/987654321098765",
      primaryLabel: "Open Facebook post",
      requiredPrefix: "QIANLU",
      requireVerificationCode: true,
      commentInstructions:
        "Paste the exact QIANLU code shown in the task so the system can match your Facebook comment automatically.",
      autoVerify: true,
      facebookPostId: "123456789012345_987654321098765",
    },
  },
  {
    type: "SOCIAL_FOLLOW",
    platform: "TIKTOK",
    title: "Follow us on TikTok",
    description: "Follow the TikTok account and return to unlock the social combo bonus.",
    points: 1,
    sortOrder: 3,
    configJson: {
      primaryUrl: "https://www.tiktok.com/@qianlu.events",
      primaryLabel: "Open TikTok profile",
      proofHint: "Show the TikTok profile with the follow state visible.",
    },
  },
  {
    type: "LEAD_FORM",
    platform: "EMAIL",
    title: "Leave your name and email",
    description: "Share your details so we can contact you about rewards and future events.",
    points: 3,
    sortOrder: 4,
    requiresVerification: false,
    verificationType: "NONE",
  },
  {
    type: "QUIZ",
    platform: "NONE",
    title: "Answer 3 brand questions",
    description: "Complete the short event quiz to earn extra points.",
    points: 3,
    sortOrder: 5,
    requiresVerification: false,
    verificationType: "NONE",
  },
  {
    type: "WHATSAPP_OPT_IN",
    platform: "WHATSAPP",
    title: "Join our WhatsApp updates",
    description: "Join the event updates group and confirm the action.",
    points: 2,
    sortOrder: 6,
    configJson: {
      primaryUrl: "https://wa.me/31612345678?text=Hi%20Qianlu%2C%20I%20want%20event%20updates.",
      primaryLabel: "Open WhatsApp chat",
      proofHint: "Show the opened WhatsApp chat or joined group to staff.",
    },
  },
  {
    type: "STAMP_SCAN",
    platform: "IN_PERSON",
    title: "Collect the welcome stamp",
    description: "Scan the QR code at the welcome point to add this stamp.",
    points: 1,
    sortOrder: 7,
    requiresVerification: false,
    verificationType: "NONE",
    configJson: {
      stampRunKey: "demo-stamp-run",
      stampRunLabel: "Demo stamp run",
    },
  },
  {
    type: "STAMP_SCAN",
    platform: "IN_PERSON",
    title: "Collect the partner stamp",
    description: "Scan the QR code at the partner point to add this stamp.",
    points: 1,
    sortOrder: 8,
    requiresVerification: false,
    verificationType: "NONE",
    configJson: {
      stampRunKey: "demo-stamp-run",
      stampRunLabel: "Demo stamp run",
    },
  },
  {
    type: "STAMP_SCAN",
    platform: "IN_PERSON",
    title: "Collect the checkout stamp",
    description: "Scan the QR code at the checkout point to add this stamp.",
    points: 1,
    sortOrder: 9,
    requiresVerification: false,
    verificationType: "NONE",
    configJson: {
      stampRunKey: "demo-stamp-run",
      stampRunLabel: "Demo stamp run",
    },
  },
];

function hashQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function hashAdminPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt-v1:${salt}:${derivedKey.toString("base64url")}`;
}

async function main() {
  const event = await prisma.event.upsert({
    where: { slug: "demo-event" },
    update: {
      name: "Qianlu Demo Event",
      status: "PUBLISHED",
      brandingJson: branding,
      settingsJson: {
        rewardTypes: ["INSTANT_REWARD", "TIERED_REWARD", "DAILY_PRIZE_DRAW"],
        rewardTiers,
      },
    },
    create: {
      slug: "demo-event",
      name: "Qianlu Demo Event",
      status: "PUBLISHED",
      brandingJson: branding,
      settingsJson: {
        rewardTypes: ["INSTANT_REWARD", "TIERED_REWARD", "DAILY_PRIZE_DRAW"],
        rewardTiers,
      },
    },
  });

  await prisma.task.deleteMany({
    where: { eventId: event.id },
  });

  await prisma.task.createMany({
    data: tasks.map((task) => ({
      ...task,
      eventId: event.id,
    })),
  });

  const stampTasks = await prisma.task.findMany({
    where: {
      eventId: event.id,
      type: "STAMP_SCAN",
    },
    orderBy: {
      sortOrder: "asc",
    },
  });
  const demoScanUrls: string[] = [];

  for (const task of stampTasks) {
    const token = randomBytes(24).toString("base64url");

    await prisma.qrCode.create({
      data: {
        eventId: event.id,
        taskId: task.id,
        label: task.title,
        publicToken: token,
        tokenHash: hashQrToken(token),
      },
    });

    demoScanUrls.push(`${demoWebBaseUrl}/${event.slug}/scan/${token}`);
  }

  const adminAccount = await prisma.adminAccount.upsert({
    where: {
      email: demoAdminEmail.toLowerCase(),
    },
    update: {
      name: "Demo Organizer",
      passwordHash: await hashAdminPassword(demoAdminPassword),
      isActive: true,
    },
    create: {
      email: demoAdminEmail.toLowerCase(),
      name: "Demo Organizer",
      passwordHash: await hashAdminPassword(demoAdminPassword),
      isActive: true,
    },
  });

  await prisma.adminEventAccess.upsert({
    where: {
      adminAccountId_eventId: {
        adminAccountId: adminAccount.id,
        eventId: event.id,
      },
    },
    update: {
      role: "OWNER",
    },
    create: {
      adminAccountId: adminAccount.id,
      eventId: event.id,
      role: "OWNER",
    },
  });

  console.log(`Seeded event ${event.slug}`);
  console.log(`Seeded demo admin ${adminAccount.email}`);
  console.log("Demo stamp scan URLs:");

  for (const url of demoScanUrls) {
    console.log(`- ${url}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
