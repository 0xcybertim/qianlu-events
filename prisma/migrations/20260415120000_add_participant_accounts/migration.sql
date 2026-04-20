-- CreateTable
CREATE TABLE "ParticipantAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantLoginToken" (
    "id" TEXT NOT NULL,
    "participantAccountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipantLoginToken_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ParticipantSession" ADD COLUMN "participantAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantAccount_email_key" ON "ParticipantAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantLoginToken_tokenHash_key" ON "ParticipantLoginToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ParticipantLoginToken_participantAccountId_eventId_idx" ON "ParticipantLoginToken"("participantAccountId", "eventId");

-- CreateIndex
CREATE INDEX "ParticipantLoginToken_expiresAt_idx" ON "ParticipantLoginToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantSession_participantAccountId_eventId_key" ON "ParticipantSession"("participantAccountId", "eventId");

-- CreateIndex
CREATE INDEX "ParticipantSession_participantAccountId_idx" ON "ParticipantSession"("participantAccountId");

-- AddForeignKey
ALTER TABLE "ParticipantLoginToken" ADD CONSTRAINT "ParticipantLoginToken_participantAccountId_fkey" FOREIGN KEY ("participantAccountId") REFERENCES "ParticipantAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantLoginToken" ADD CONSTRAINT "ParticipantLoginToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantSession" ADD CONSTRAINT "ParticipantSession_participantAccountId_fkey" FOREIGN KEY ("participantAccountId") REFERENCES "ParticipantAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
