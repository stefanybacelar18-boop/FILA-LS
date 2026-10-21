const INDEXES = [
  'CREATE INDEX IF NOT EXISTS "Trip_vehicleId_status_idx" ON "Trip" ("vehicleId", "status")',
  'CREATE INDEX IF NOT EXISTS "Trip_status_idx" ON "Trip" ("status")',
  'CREATE INDEX IF NOT EXISTS "Trip_departureAt_idx" ON "Trip" ("departureAt")',
  'CREATE INDEX IF NOT EXISTS "Vehicle_status_idx" ON "Vehicle" ("status")',
  'CREATE INDEX IF NOT EXISTS "Vehicle_active_idx" ON "Vehicle" ("active")',
  'CREATE INDEX IF NOT EXISTS "Vehicle_owner_idx" ON "Vehicle" ("owner")',
  'CREATE INDEX IF NOT EXISTS "Route_status_date_idx" ON "Route" ("status", "date")',
  'CREATE INDEX IF NOT EXISTS "Route_date_idx" ON "Route" ("date")',
];

const COLUMNS = [
  'ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true',
  'ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "owner" TEXT NOT NULL DEFAULT \'AG\'',
  'ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "pernoiteNightsOverride" INTEGER',
];

// Postgres de produção. A migration Prisma é SQLite (DATETIME) e o Render
// nem sempre roda migrate deploy; estas sentenças é que criam o expediente.
const CALENDAR_TABLES = [
  `CREATE TABLE IF NOT EXISTS "DealershipHour" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekday" INTEGER NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT,
    "closeTime" TEXT,
    "dealershipId" TEXT NOT NULL,
    CONSTRAINT "DealershipHour_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "DealershipHour_dealershipId_weekday_key" ON "DealershipHour"("dealershipId", "weekday")',
  `CREATE TABLE IF NOT EXISTS "DealershipClosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "note" TEXT,
    "dealershipId" TEXT NOT NULL,
    CONSTRAINT "DealershipClosure_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "DealershipClosure_dealershipId_date_key" ON "DealershipClosure"("dealershipId", "date")',
  'CREATE INDEX IF NOT EXISTS "DealershipClosure_date_idx" ON "DealershipClosure"("date")',
];

type RawDb = { $executeRawUnsafe: (sql: string) => Promise<unknown> };

async function applyStatements(db: RawDb, statements: string[], label: string): Promise<void> {
  for (const sql of statements) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch (err) {
      console.warn(`${label} (ignorado):`, sql, (err as Error).message);
    }
  }
}

/** Cria expediente e fechamento antes do listen, no Postgres de produção. */
export async function ensureDealershipCalendarTables(db: RawDb): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (!/^postgres(ql)?:\/\//i.test(url)) return;
  await applyStatements(db, CALENDAR_TABLES, 'Expediente');
}

/** Aplica índices sem bloquear o listen (não usa prisma db push no start). */
export async function ensureHotIndexes(db: RawDb): Promise<void> {
  await applyStatements(db, [...COLUMNS, ...INDEXES], 'Índice');
}
