-- Matrícula do motorista padrão. Placa AG fica sem valor.
ALTER TABLE "Vehicle" ADD COLUMN "driverMatricula" TEXT;

CREATE UNIQUE INDEX "Vehicle_driverMatricula_key" ON "Vehicle"("driverMatricula");
