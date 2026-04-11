ALTER TABLE "ParticipantSession" ADD COLUMN "verificationCode" TEXT;

UPDATE "ParticipantSession"
SET "verificationCode" = upper(substr(md5("id" || ':' || "anonymousToken"), 1, 8))
WHERE "verificationCode" IS NULL;

ALTER TABLE "ParticipantSession" ALTER COLUMN "verificationCode" SET NOT NULL;

CREATE UNIQUE INDEX "ParticipantSession_eventId_verificationCode_key"
ON "ParticipantSession"("eventId", "verificationCode");
