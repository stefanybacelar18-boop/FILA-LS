-- Garante a matrícula no motorista mesmo se a migração anterior foi marcada
-- como aplicada sem rodar. Não depende da coluna antiga da placa.
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "matricula" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Driver_matricula_key" ON "Driver"("matricula");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Vehicle'
      AND column_name = 'driverMatricula'
  ) THEN
    UPDATE "Driver" AS d
    SET "matricula" = sub."driverMatricula"
    FROM (
      SELECT DISTINCT ON (upper(regexp_replace("defaultDriver", '\s+', ' ', 'g')))
        "defaultDriver",
        "driverMatricula"
      FROM "Vehicle"
      WHERE "driverMatricula" IS NOT NULL
        AND "defaultDriver" IS NOT NULL
        AND length(trim("defaultDriver")) >= 2
      ORDER BY upper(regexp_replace("defaultDriver", '\s+', ' ', 'g')), "updatedAt" DESC
    ) AS sub
    WHERE d."matricula" IS NULL
      AND upper(regexp_replace(d."name", '\s+', ' ', 'g')) = upper(regexp_replace(sub."defaultDriver", '\s+', ' ', 'g'));

    ALTER TABLE "Vehicle" DROP COLUMN "driverMatricula";
  END IF;
END $$;
