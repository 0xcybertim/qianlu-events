-- CreateTable
CREATE TABLE "EventFacebookConnection" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "pageAccessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventFacebookConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventFacebookConnection_eventId_key" ON "EventFacebookConnection"("eventId");

-- CreateIndex
CREATE INDEX "EventFacebookConnection_pageId_idx" ON "EventFacebookConnection"("pageId");

-- AddForeignKey
ALTER TABLE "EventFacebookConnection" ADD CONSTRAINT "EventFacebookConnection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
