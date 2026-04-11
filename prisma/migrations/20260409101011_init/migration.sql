-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('SOCIAL_FOLLOW', 'SOCIAL_LIKE', 'SOCIAL_SHARE', 'LEAD_FORM', 'QUIZ', 'NEWSLETTER_OPT_IN', 'WHATSAPP_OPT_IN', 'REFERRAL', 'PHOTO_PROOF');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WHATSAPP', 'EMAIL', 'IN_PERSON', 'NONE');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('NONE', 'VISUAL_STAFF_CHECK', 'STAFF_PIN_CONFIRM');

-- CreateEnum
CREATE TYPE "TaskAttemptStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED_BY_USER', 'PENDING_STAFF_CHECK', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationActionType" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('INSTANT_REWARD', 'TIERED_REWARD', 'DAILY_PRIZE_DRAW');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "brandingJson" JSONB,
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "platform" "SocialPlatform" NOT NULL DEFAULT 'NONE',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "requiresVerification" BOOLEAN NOT NULL DEFAULT true,
    "verificationType" "VerificationType" NOT NULL DEFAULT 'VISUAL_STAFF_CHECK',
    "configJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantSession" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "anonymousToken" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "claimedPoints" INTEGER NOT NULL DEFAULT 0,
    "verifiedPoints" INTEGER NOT NULL DEFAULT 0,
    "rewardTier" TEXT,
    "instantRewardEligible" BOOLEAN NOT NULL DEFAULT false,
    "dailyDrawEligible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttempt" (
    "id" TEXT NOT NULL,
    "participantSessionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "TaskAttemptStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "claimedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "verificationRequired" BOOLEAN NOT NULL DEFAULT true,
    "proofJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationAction" (
    "id" TEXT NOT NULL,
    "participantSessionId" TEXT NOT NULL,
    "taskAttemptId" TEXT NOT NULL,
    "action" "VerificationActionType" NOT NULL,
    "verifiedByType" TEXT NOT NULL,
    "verifiedByIdentifier" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardEligibility" (
    "id" TEXT NOT NULL,
    "participantSessionId" TEXT NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "rewardKey" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Task_eventId_sortOrder_idx" ON "Task"("eventId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantSession_anonymousToken_key" ON "ParticipantSession"("anonymousToken");

-- CreateIndex
CREATE INDEX "ParticipantSession_eventId_idx" ON "ParticipantSession"("eventId");

-- CreateIndex
CREATE INDEX "TaskAttempt_taskId_idx" ON "TaskAttempt"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttempt_participantSessionId_taskId_key" ON "TaskAttempt"("participantSessionId", "taskId");

-- CreateIndex
CREATE INDEX "VerificationAction_participantSessionId_idx" ON "VerificationAction"("participantSessionId");

-- CreateIndex
CREATE INDEX "VerificationAction_taskAttemptId_idx" ON "VerificationAction"("taskAttemptId");

-- CreateIndex
CREATE INDEX "RewardEligibility_participantSessionId_idx" ON "RewardEligibility"("participantSessionId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantSession" ADD CONSTRAINT "ParticipantSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_participantSessionId_fkey" FOREIGN KEY ("participantSessionId") REFERENCES "ParticipantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationAction" ADD CONSTRAINT "VerificationAction_participantSessionId_fkey" FOREIGN KEY ("participantSessionId") REFERENCES "ParticipantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationAction" ADD CONSTRAINT "VerificationAction_taskAttemptId_fkey" FOREIGN KEY ("taskAttemptId") REFERENCES "TaskAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardEligibility" ADD CONSTRAINT "RewardEligibility_participantSessionId_fkey" FOREIGN KEY ("participantSessionId") REFERENCES "ParticipantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
