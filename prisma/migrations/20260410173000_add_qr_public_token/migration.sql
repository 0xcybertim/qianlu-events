-- AlterTable
ALTER TABLE "QrCode" ADD COLUMN "publicToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "QrCode_publicToken_key" ON "QrCode"("publicToken");
