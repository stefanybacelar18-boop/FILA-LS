-- Chassi e nota fiscal de cada moto da carga Chronus.
CREATE TABLE "CargoItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chassis" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL DEFAULT '',
    "invoiceKey" TEXT NOT NULL DEFAULT '',
    "model" TEXT,
    "routeId" TEXT NOT NULL,
    "dealershipId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CargoItem_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CargoItem_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CargoItem_routeId_chassis_key" ON "CargoItem"("routeId", "chassis");
CREATE INDEX "CargoItem_chassis_idx" ON "CargoItem"("chassis");
CREATE INDEX "CargoItem_invoiceKey_idx" ON "CargoItem"("invoiceKey");
