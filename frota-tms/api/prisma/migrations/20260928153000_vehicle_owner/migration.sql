-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "owner" TEXT NOT NULL DEFAULT 'AG';

-- CreateIndex
CREATE INDEX "Vehicle_owner_idx" ON "Vehicle"("owner");

-- Backfill: placas LSL históricas + UEV4A13 (pedido operacional)
UPDATE "Vehicle" SET "owner" = 'LSL' WHERE "plate" IN (
  'EZU2D86',
  'EOE1F87',
  'SVS9H87',
  'SVG0H96',
  'TKX7D86',
  'BPQ1E82',
  'EOE1F81',
  'SUC6B93',
  'TME3H94',
  'UEV4A13'
);
