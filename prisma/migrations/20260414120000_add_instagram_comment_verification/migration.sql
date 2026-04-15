-- CreateTable
CREATE TABLE "AdminInstagramOAuthState" (
    "id" TEXT NOT NULL,
    "adminAccountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "accountOptionsJson" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminInstagramOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventInstagramConnection" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "instagramAccountId" TEXT NOT NULL,
    "instagramUsername" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventInstagramConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminInstagramOAuthState_state_key" ON "AdminInstagramOAuthState"("state");

-- CreateIndex
CREATE INDEX "AdminInstagramOAuthState_adminAccountId_eventId_idx" ON "AdminInstagramOAuthState"("adminAccountId", "eventId");

-- CreateIndex
CREATE INDEX "AdminInstagramOAuthState_expiresAt_idx" ON "AdminInstagramOAuthState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventInstagramConnection_eventId_key" ON "EventInstagramConnection"("eventId");

-- CreateIndex
CREATE INDEX "EventInstagramConnection_pageId_idx" ON "EventInstagramConnection"("pageId");

-- CreateIndex
CREATE INDEX "EventInstagramConnection_instagramAccountId_idx" ON "EventInstagramConnection"("instagramAccountId");

-- AddForeignKey
ALTER TABLE "AdminInstagramOAuthState" ADD CONSTRAINT "AdminInstagramOAuthState_adminAccountId_fkey" FOREIGN KEY ("adminAccountId") REFERENCES "AdminAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminInstagramOAuthState" ADD CONSTRAINT "AdminInstagramOAuthState_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInstagramConnection" ADD CONSTRAINT "EventInstagramConnection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
