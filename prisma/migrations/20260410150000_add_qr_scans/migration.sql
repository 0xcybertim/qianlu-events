-- Add QR-backed stamp scan task support.
ALTER TYPE "TaskType" ADD VALUE 'STAMP_SCAN';

CREATE TYPE "QrScanStatus" AS ENUM (
  'ACCEPTED',
  'DUPLICATE',
  'EXPIRED',
  'INACTIVE',
  'WRONG_EVENT'
);

CREATE TABLE "QrCode" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "scanLimitPerSession" INTEGER NOT NULL DEFAULT 1,
  "cooldownSeconds" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "QrCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QrScan" (
  "id" TEXT NOT NULL,
  "participantSessionId" TEXT NOT NULL,
  "qrCodeId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "status" "QrScanStatus" NOT NULL,
  "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
  "rejectionReason" TEXT,
  "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QrScan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QrCode_tokenHash_key" ON "QrCode"("tokenHash");
CREATE INDEX "QrCode_eventId_idx" ON "QrCode"("eventId");
CREATE INDEX "QrCode_taskId_idx" ON "QrCode"("taskId");
CREATE INDEX "QrScan_participantSessionId_idx" ON "QrScan"("participantSessionId");
CREATE INDEX "QrScan_qrCodeId_idx" ON "QrScan"("qrCodeId");
CREATE INDEX "QrScan_taskId_idx" ON "QrScan"("taskId");

ALTER TABLE "QrCode"
  ADD CONSTRAINT "QrCode_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QrCode"
  ADD CONSTRAINT "QrCode_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QrScan"
  ADD CONSTRAINT "QrScan_participantSessionId_fkey"
  FOREIGN KEY ("participantSessionId") REFERENCES "ParticipantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QrScan"
  ADD CONSTRAINT "QrScan_qrCodeId_fkey"
  FOREIGN KEY ("qrCodeId") REFERENCES "QrCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QrScan"
  ADD CONSTRAINT "QrScan_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
