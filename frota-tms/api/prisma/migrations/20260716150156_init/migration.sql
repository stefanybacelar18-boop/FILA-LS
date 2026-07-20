-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CONSULTA',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plate" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "capacityKg" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISPONIVEL',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Dealership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "distanceKm" REAL NOT NULL,
    "avgTravelDays" REAL NOT NULL,
    "allowedVehicle" TEXT NOT NULL DEFAULT 'AMBOS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "region" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_PLACAS',
    "hasPriority" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "Route_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Route_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RouteVehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "routeId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    CONSTRAINT "RouteVehicle_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RouteVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriorityProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "lot" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "expiryDate" DATETIME NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RouteProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    CONSTRAINT "RouteProduct_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RouteProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PriorityProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverName" TEXT,
    "departureAt" DATETIME NOT NULL,
    "expectedReturn" DATETIME NOT NULL,
    "returnedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "routeId" TEXT,
    "assignedById" TEXT NOT NULL,
    "returnedById" TEXT,
    CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Trip_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicleId" TEXT NOT NULL,
    "userId" TEXT,
    "tripId" TEXT,
    CONSTRAINT "VehicleHistory_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "RouteVehicle_routeId_vehicleId_key" ON "RouteVehicle"("routeId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteProduct_routeId_productId_key" ON "RouteProduct"("routeId", "productId");
