-- CreateTable
CREATE TABLE "DealershipHour" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekday" INTEGER NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT,
    "closeTime" TEXT,
    "dealershipId" TEXT NOT NULL,
    CONSTRAINT "DealershipHour_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DealershipClosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "kind" TEXT NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "note" TEXT,
    "dealershipId" TEXT NOT NULL,
    CONSTRAINT "DealershipClosure_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DealershipHour_dealershipId_weekday_key" ON "DealershipHour"("dealershipId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "DealershipClosure_dealershipId_date_key" ON "DealershipClosure"("dealershipId", "date");

-- CreateIndex
CREATE INDEX "DealershipClosure_date_idx" ON "DealershipClosure"("date");
