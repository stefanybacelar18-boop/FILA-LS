-- Matrícula do motorista. Não fica na placa.
ALTER TABLE "Driver" ADD COLUMN "matricula" TEXT;

CREATE UNIQUE INDEX "Driver_matricula_key" ON "Driver"("matricula");
