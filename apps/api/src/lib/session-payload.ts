import { participantSessionSchema } from "@qianlu-events/schemas";

type SerializableTaskAttempt = {
  id: string;
  taskId: string;
  status: string;
  verificationRequired?: boolean;
  proofJson?: unknown;
};

type SerializableRewardEligibility = {
  id: string;
  rewardType: string;
  rewardKey: string;
  eligible: boolean;
  verified: boolean;
  reason?: string | null;
};

type SerializableParticipantSession = {
  id: string;
  eventId: string;
  participantAccount?: {
    accountUuid: string;
  } | null;
  verificationCode: string;
  email?: string | null;
  name?: string | null;
  claimedPoints: number;
  verifiedPoints: number;
  rewardTier?: string | null;
  instantRewardEligible: boolean;
  dailyDrawEligible: boolean;
  taskAttempts: SerializableTaskAttempt[];
  rewardEligibility: SerializableRewardEligibility[];
};

export function serializeParticipantSessionForClient(
  session: SerializableParticipantSession,
) {
  return participantSessionSchema.parse({
    id: session.id,
    eventId: session.eventId,
    participantAccountUuid: session.participantAccount?.accountUuid ?? null,
    verificationCode: session.verificationCode,
    email: session.email,
    name: session.name,
    claimedPoints: session.claimedPoints,
    verifiedPoints: session.verifiedPoints,
    rewardTier: session.rewardTier,
    instantRewardEligible: session.instantRewardEligible,
    dailyDrawEligible: session.dailyDrawEligible,
    taskAttempts: session.taskAttempts.map((attempt) => ({
      id: attempt.id,
      taskId: attempt.taskId,
      status: attempt.status,
      verificationRequired: attempt.verificationRequired,
      proofJson: attempt.proofJson,
    })),
    rewardEligibility: session.rewardEligibility.map((eligibility) => ({
      id: eligibility.id,
      rewardType: eligibility.rewardType,
      rewardKey: eligibility.rewardKey,
      eligible: eligibility.eligible,
      verified: eligibility.verified,
      reason: eligibility.reason,
    })),
  });
}
