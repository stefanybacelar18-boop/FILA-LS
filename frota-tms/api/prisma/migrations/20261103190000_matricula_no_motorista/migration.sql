-- A matrícula é do motorista. O que chegou a ser gravado na placa LSL segue para ele.
ALTER TABLE "Driver" ADD COLUMN "matricula" TEXT;

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

INSERT INTO "Driver" ("id", "name", "matricula", "active", "blocked", "createdAt", "updatedAt")
SELECT
  substr(md5(v."id" || ':' || v."driverMatricula"), 1, 25),
  trim(v."defaultDriver"),
  v."driverMatricula",
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Vehicle" AS v
WHERE v."driverMatricula" IS NOT NULL
  AND v."defaultDriver" IS NOT NULL
  AND length(trim(v."defaultDriver")) >= 2
  AND NOT EXISTS (
    SELECT 1 FROM "Driver" AS d WHERE d."matricula" = v."driverMatricula"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Driver" AS d
    WHERE upper(regexp_replace(d."name", '\s+', ' ', 'g')) = upper(regexp_replace(v."defaultDriver", '\s+', ' ', 'g'))
  );

CREATE UNIQUE INDEX "Driver_matricula_key" ON "Driver"("matricula");

DROP INDEX IF EXISTS "Vehicle_driverMatricula_key";
ALTER TABLE "Vehicle" DROP COLUMN "driverMatricula";
