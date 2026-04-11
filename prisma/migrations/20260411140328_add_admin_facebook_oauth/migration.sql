-- CreateTable
CREATE TABLE "AdminFacebookOAuthState" (
    "id" TEXT NOT NULL,
    "adminAccountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pageOptionsJson" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminFacebookOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminFacebookOAuthState_state_key" ON "AdminFacebookOAuthState"("state");

-- CreateIndex
CREATE INDEX "AdminFacebookOAuthState_adminAccountId_eventId_idx" ON "AdminFacebookOAuthState"("adminAccountId", "eventId");

-- CreateIndex
CREATE INDEX "AdminFacebookOAuthState_expiresAt_idx" ON "AdminFacebookOAuthState"("expiresAt");

-- AddForeignKey
ALTER TABLE "AdminFacebookOAuthState" ADD CONSTRAINT "AdminFacebookOAuthState_adminAccountId_fkey" FOREIGN KEY ("adminAccountId") REFERENCES "AdminAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFacebookOAuthState" ADD CONSTRAINT "AdminFacebookOAuthState_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
