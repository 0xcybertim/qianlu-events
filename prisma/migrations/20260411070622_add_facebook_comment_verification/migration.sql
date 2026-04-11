-- AlterEnum
ALTER TYPE "TaskAttemptStatus" ADD VALUE 'PENDING_AUTO_VERIFICATION';

-- AlterEnum
ALTER TYPE "TaskType" ADD VALUE 'SOCIAL_COMMENT';

-- AlterEnum
ALTER TYPE "VerificationType" ADD VALUE 'AUTOMATIC';

-- CreateTable
CREATE TABLE "SocialCommentVerification" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "externalCommentId" TEXT NOT NULL,
    "externalPostId" TEXT,
    "commentText" TEXT,
    "rawPayload" JSONB NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "participantSessionId" TEXT,
    "taskId" TEXT,
    "taskAttemptId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialCommentVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialCommentVerification_participantSessionId_idx" ON "SocialCommentVerification"("participantSessionId");

-- CreateIndex
CREATE INDEX "SocialCommentVerification_taskId_idx" ON "SocialCommentVerification"("taskId");

-- CreateIndex
CREATE INDEX "SocialCommentVerification_taskAttemptId_idx" ON "SocialCommentVerification"("taskAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialCommentVerification_platform_externalCommentId_key" ON "SocialCommentVerification"("platform", "externalCommentId");

-- AddForeignKey
ALTER TABLE "SocialCommentVerification" ADD CONSTRAINT "SocialCommentVerification_participantSessionId_fkey" FOREIGN KEY ("participantSessionId") REFERENCES "ParticipantSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialCommentVerification" ADD CONSTRAINT "SocialCommentVerification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialCommentVerification" ADD CONSTRAINT "SocialCommentVerification_taskAttemptId_fkey" FOREIGN KEY ("taskAttemptId") REFERENCES "TaskAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
