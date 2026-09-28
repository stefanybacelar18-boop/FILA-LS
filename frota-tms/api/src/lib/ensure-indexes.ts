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

/** Aplica índices sem bloquear o listen (não usa prisma db push no start). */
export async function ensureHotIndexes(db: {
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
}): Promise<void> {
  for (const sql of [...COLUMNS, ...INDEXES]) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch (err) {
      console.warn('Índice (ignorado):', sql, (err as Error).message);
    }
  }
}
