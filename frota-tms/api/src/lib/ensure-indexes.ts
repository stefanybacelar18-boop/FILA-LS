const INDEXES = [
  'CREATE INDEX IF NOT EXISTS "Trip_vehicleId_status_idx" ON "Trip" ("vehicleId", "status")',
  'CREATE INDEX IF NOT EXISTS "Trip_status_idx" ON "Trip" ("status")',
  'CREATE INDEX IF NOT EXISTS "Trip_departureAt_idx" ON "Trip" ("departureAt")',
  'CREATE INDEX IF NOT EXISTS "Vehicle_status_idx" ON "Vehicle" ("status")',
  'CREATE INDEX IF NOT EXISTS "Route_status_date_idx" ON "Route" ("status", "date")',
  'CREATE INDEX IF NOT EXISTS "Route_date_idx" ON "Route" ("date")',
];

/** Aplica índices sem bloquear o listen (não usa prisma db push no start). */
export async function ensureHotIndexes(db: {
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
}): Promise<void> {
  for (const sql of INDEXES) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch (err) {
      console.warn('Índice (ignorado):', sql, (err as Error).message);
    }
  }
}
