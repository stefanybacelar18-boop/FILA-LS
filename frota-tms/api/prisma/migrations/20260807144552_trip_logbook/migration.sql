/*
  Warnings:

  - You are about to drop the column `capacityKg` on the `Vehicle` table. All the data in the column will be lost.
  - Added the required column `capacityMotos` to the `Vehicle` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Dealership" ADD COLUMN "code" TEXT;
ALTER TABLE "Dealership" ADD COLUMN "phone" TEXT;

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "blockedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RouteDealership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order" INTEGER NOT NULL DEFAULT 0,
    "minExpiryDate" DATETIME,
    "motoCount" INTEGER,
    "routeId" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    CONSTRAINT "RouteDealership_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RouteDealership_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlateUnavailability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reason" TEXT NOT NULL,
    "availableAtForecast" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "routeId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    CONSTRAINT "PlateUnavailability_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlateUnavailability_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlateUnavailability_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tripId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    CONSTRAINT "TripEvidence_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanningCity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "noteCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dealershipId" TEXT,
    "routeId" TEXT,
    "importBatchId" TEXT,
    CONSTRAINT "PlanningCity_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanningCity_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanningCity_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "previewJson" TEXT,
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripLogbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formCode" TEXT NOT NULL DEFAULT 'FCDE-LSLT-018c-01',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tripId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverMatricula" TEXT,
    "helperName" TEXT,
    "helperMatricula" TEXT,
    "kmInitial" INTEGER,
    "kmFinal" INTEGER,
    "fuelDieselDeparture" TEXT,
    "fuelOilDeparture" TEXT,
    "fuelDieselReturn" TEXT,
    "fuelOilReturn" TEXT,
    "checklistDeparture" TEXT,
    "checklistReturn" TEXT,
    "fuelingDepartureJson" TEXT,
    "fuelingReturnJson" TEXT,
    "damageDescription" TEXT,
    "damageMarksJson" TEXT,
    "maintenanceDescription" TEXT,
    "departureSignedAt" DATETIME,
    "departureSignaturePng" TEXT,
    "departureSignedIp" TEXT,
    "departureUserAgent" TEXT,
    "returnSignedAt" DATETIME,
    "returnSignaturePng" TEXT,
    "returnSignedIp" TEXT,
    "returnUserAgent" TEXT,
    "coordinatorSignedAt" DATETIME,
    "coordinatorSignaturePng" TEXT,
    "coordinatorUserId" TEXT,
    CONSTRAINT "TripLogbook_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripLogbook_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TripLogbook_coordinatorUserId_fkey" FOREIGN KEY ("coordinatorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Route" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "region" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_PLACAS',
    "hasPriority" BOOLEAN NOT NULL DEFAULT false,
    "priorityNotes" TEXT,
    "priorityExpiryDate" DATETIME,
    "plannedVehicleCount" INTEGER,
    "totalMotoCount" INTEGER,
    "requiredFleetOwner" TEXT,
    "requiredCapacityMotos" INTEGER,
    "readyForOperation" BOOLEAN NOT NULL DEFAULT false,
    "sentToOperationAt" DATETIME,
    "sentToOperationById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dealershipId" TEXT,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "Route_sentToOperationById_fkey" FOREIGN KEY ("sentToOperationById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Route_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Route_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Route" ("createdAt", "createdById", "date", "dealershipId", "hasPriority", "id", "name", "notes", "region", "status", "updatedAt") SELECT "createdAt", "createdById", "date", "dealershipId", "hasPriority", "id", "name", "notes", "region", "status", "updatedAt" FROM "Route";
DROP TABLE "Route";
ALTER TABLE "new_Route" RENAME TO "Route";
CREATE TABLE "new_Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverName" TEXT,
    "departureAt" DATETIME NOT NULL,
    "expectedReturn" DATETIME NOT NULL,
    "returnedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
    "notes" TEXT,
    "delayReason" TEXT,
    "delayReportedAt" DATETIME,
    "delayReportedById" TEXT,
    "unavailableReason" TEXT,
    "unavailableAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "routeId" TEXT,
    "assignedById" TEXT NOT NULL,
    "returnedById" TEXT,
    CONSTRAINT "Trip_delayReportedById_fkey" FOREIGN KEY ("delayReportedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Trip_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Trip" ("assignedById", "createdAt", "dealershipId", "departureAt", "driverName", "expectedReturn", "id", "notes", "returnedAt", "returnedById", "routeId", "status", "updatedAt", "vehicleId") SELECT "assignedById", "createdAt", "dealershipId", "departureAt", "driverName", "expectedReturn", "id", "notes", "returnedAt", "returnedById", "routeId", "status", "updatedAt", "vehicleId" FROM "Trip";
DROP TABLE "Trip";
ALTER TABLE "new_Trip" RENAME TO "Trip";
CREATE TABLE "new_Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plate" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "capacityMotos" REAL NOT NULL,
    "defaultDriver" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISPONIVEL',
    "notes" TEXT,
    "maintenanceHold" BOOLEAN NOT NULL DEFAULT false,
    "blockCategory" TEXT,
    "blockReason" TEXT,
    "blockedAt" DATETIME,
    "blockedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vehicle_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Vehicle" ("brand", "createdAt", "id", "model", "notes", "plate", "status", "type", "updatedAt", "year") SELECT "brand", "createdAt", "id", "model", "notes", "plate", "status", "type", "updatedAt", "year" FROM "Vehicle";
DROP TABLE "Vehicle";
ALTER TABLE "new_Vehicle" RENAME TO "Vehicle";
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Driver_name_key" ON "Driver"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RouteDealership_routeId_dealershipId_key" ON "RouteDealership"("routeId", "dealershipId");

-- CreateIndex
CREATE UNIQUE INDEX "PlateUnavailability_routeId_vehicleId_key" ON "PlateUnavailability"("routeId", "vehicleId");

-- CreateIndex
CREATE INDEX "PlanningCity_status_idx" ON "PlanningCity"("status");

-- CreateIndex
CREATE INDEX "PlanningCity_city_idx" ON "PlanningCity"("city");

-- CreateIndex
CREATE UNIQUE INDEX "TripLogbook_tripId_key" ON "TripLogbook"("tripId");
