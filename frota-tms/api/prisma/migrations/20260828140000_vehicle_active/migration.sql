-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Vehicle_active_idx" ON "Vehicle"("active");
