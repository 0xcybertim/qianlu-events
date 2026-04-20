ALTER TABLE "ParticipantAccount"
ADD COLUMN "accountUuid" TEXT,
ADD COLUMN "clerkUserId" TEXT;

WITH generated AS (
  SELECT
    "id",
    md5("id" || random()::text || clock_timestamp()::text) AS "hash"
  FROM "ParticipantAccount"
)
UPDATE "ParticipantAccount" AS account
SET "accountUuid" = lower(
  substr(generated."hash", 1, 8) || '-' ||
  substr(generated."hash", 9, 4) || '-' ||
  '4' || substr(generated."hash", 14, 3) || '-' ||
  'a' || substr(generated."hash", 18, 3) || '-' ||
  substr(generated."hash", 21, 12)
)
FROM generated
WHERE account."id" = generated."id"
  AND account."accountUuid" IS NULL;

ALTER TABLE "ParticipantAccount"
ALTER COLUMN "accountUuid" SET NOT NULL;

CREATE UNIQUE INDEX "ParticipantAccount_accountUuid_key"
ON "ParticipantAccount"("accountUuid");

CREATE UNIQUE INDEX "ParticipantAccount_clerkUserId_key"
ON "ParticipantAccount"("clerkUserId");
