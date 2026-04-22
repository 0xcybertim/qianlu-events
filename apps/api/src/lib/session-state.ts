import { eventSettingsSchema } from "@qianlu-events/schemas";
import { calculateRewardSnapshot } from "@qianlu-events/domain";

import { serializeEventForClient } from "./event-payload.js";
import { prisma } from "./prisma.js";
import { serializeParticipantSessionForClient } from "./session-payload.js";

async function loadSessionContext(sessionId: string) {
  const session = await prisma.participantSession.findUnique({
    where: { id: sessionId },
    include: {
      participantAccount: {
        select: {
          accountUuid: true,
        },
      },
      event: {
        include: {
          tasks: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      taskAttempts: true,
      rewardEligibility: true,
    },
  });

  if (!session) {
    throw new Error("Session not found.");
  }

  return session;
}

export async function ensureSessionTaskAttempts(args: {
  sessionId: string;
  tasks: { id: string; requiresVerification: boolean }[];
}) {
  const existingAttempts = await prisma.taskAttempt.findMany({
    where: {
      participantSessionId: args.sessionId,
    },
    select: {
      taskId: true,
    },
  });
  const existingAttemptTaskIds = new Set(
    existingAttempts.map((attempt) => attempt.taskId),
  );
  const missingTasks = args.tasks.filter(
    (task) => !existingAttemptTaskIds.has(task.id),
  );

  if (missingTasks.length === 0) {
    return false;
  }

  await prisma.taskAttempt.createMany({
    data: missingTasks.map((task) => ({
      participantSessionId: args.sessionId,
      taskId: task.id,
      verificationRequired: task.requiresVerification,
    })),
  });

  return true;
}

export async function recalculateSessionState(sessionId: string) {
  const session = await loadSessionContext(sessionId);
  const event = serializeEventForClient(session.event);
  const eventSettings = eventSettingsSchema.safeParse(session.event.settingsJson);
  const rewardTypes = eventSettings.success ? eventSettings.data.rewardTypes : [];
  const rewardTiers = eventSettings.success ? eventSettings.data.rewardTiers : [];
  const instantRewards = eventSettings.success ? eventSettings.data.instantRewards : [];

  const snapshot = calculateRewardSnapshot({
    tasks: event.tasks,
    attempts: session.taskAttempts,
    rewardTiers,
    rewardTypes,
    instantRewards,
  });

  await prisma.$transaction([
    prisma.participantSession.update({
      where: { id: session.id },
      data: {
        claimedPoints: snapshot.claimedPoints,
        verifiedPoints: snapshot.verifiedPoints,
        rewardTier: snapshot.highestClaimedTier?.key ?? null,
        instantRewardEligible: snapshot.instantRewardEligible,
        dailyDrawEligible: snapshot.dailyDrawEligible,
      },
    }),
    prisma.rewardEligibility.deleteMany({
      where: {
        participantSessionId: session.id,
      },
    }),
    ...(rewardTypes.length > 0
      ? [
          prisma.rewardEligibility.createMany({
            data: [
              ...(rewardTypes.includes("TIERED_REWARD")
                ? rewardTiers.map((tier) => ({
                    participantSessionId: session.id,
                    rewardType: "TIERED_REWARD" as const,
                    rewardKey: tier.key,
                    eligible: snapshot.claimedPoints >= tier.threshold,
                    verified: snapshot.verifiedPoints >= tier.threshold,
                    reason: `Reach ${tier.threshold} points to unlock ${tier.label}.`,
                  }))
                : []),
              ...(rewardTypes.includes("INSTANT_REWARD")
                ? [
                    {
                      participantSessionId: session.id,
                      rewardType: "INSTANT_REWARD" as const,
                      rewardKey: "instant-reward",
                      eligible: snapshot.instantRewardEligible,
                      verified: snapshot.instantRewardEligible,
                      reason: "Instant reward requires verified completion.",
                    },
                    ...snapshot.instantRewards.map((reward) => ({
                      participantSessionId: session.id,
                      rewardType: "INSTANT_REWARD" as const,
                      rewardKey: reward.rewardKey,
                      eligible: reward.eligible,
                      verified: reward.verified,
                      reason: reward.description
                        ? `${reward.label}: ${reward.description}`
                        : reward.label,
                    })),
                  ]
                : []),
              ...(rewardTypes.includes("DAILY_PRIZE_DRAW")
                ? [
                    {
                      participantSessionId: session.id,
                      rewardType: "DAILY_PRIZE_DRAW" as const,
                      rewardKey: "daily-draw",
                      eligible: snapshot.dailyDrawEligible,
                      verified: snapshot.dailyDrawEligible,
                      reason: "Daily draw entries require verified participation.",
                    },
                  ]
                : []),
            ],
          }),
        ]
      : []),
  ]);

  const updatedSession = await prisma.participantSession.findUniqueOrThrow({
    where: { id: session.id },
    include: {
      participantAccount: {
        select: {
          accountUuid: true,
        },
      },
      taskAttempts: true,
      rewardEligibility: true,
    },
  });

  return serializeParticipantSessionForClient(updatedSession);
}

export async function recalculateEventSessions(eventId: string) {
  const sessions = await prisma.participantSession.findMany({
    where: { eventId },
    select: { id: true },
  });

  for (const session of sessions) {
    await recalculateSessionState(session.id);
  }
}

export async function findEventSessionByToken(args: {
  eventSlug: string;
  token?: string;
}) {
  if (!args.token) {
    return null;
  }

  return prisma.participantSession.findFirst({
    where: {
      anonymousToken: args.token,
      event: {
        slug: args.eventSlug,
      },
    },
    include: {
      participantAccount: {
        select: {
          accountUuid: true,
        },
      },
      taskAttempts: true,
      rewardEligibility: true,
      event: {
        include: {
          tasks: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
}
