-- AlterTable
ALTER TABLE "TripLogbook" ADD COLUMN "reportFormCode" TEXT NOT NULL DEFAULT 'RB-LSL-01B-01';
ALTER TABLE "TripLogbook" ADD COLUMN "stopsJson" TEXT;
ALTER TABLE "TripLogbook" ADD COLUMN "reportExtrasJson" TEXT;
ALTER TABLE "TripLogbook" ADD COLUMN "tripObservations" TEXT;
