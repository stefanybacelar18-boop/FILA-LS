-- PARTE 1 de 3 — Tabelas, índices e geofence
-- Nova aba no SQL Editor. Rode reset.sql antes se houve erro.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('motorista', 'operador', 'supervisor', 'administrador');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE queue_status AS ENUM (
    'aguardando', 'chamado', 'em_deslocamento', 'em_descarga',
    'finalizado', 'ausente', 'cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'operador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  telefone TEXT NOT NULL,
  placa TEXT NOT NULL,
  transportadora TEXT NOT NULL,
  empresa TEXT NOT NULL,
  tipo_carga TEXT NOT NULL,
  observacoes TEXT,
  status queue_status NOT NULL DEFAULT 'aguardando',
  doca TEXT,
  previsao_descarregamento TIMESTAMPTZ,
  posicao_fila INTEGER,
  checkin_lat DOUBLE PRECISION,
  checkin_lng DOUBLE PRECISION,
  called_at TIMESTAMPTZ,
  started_unload_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queue_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_entry_id UUID NOT NULL REFERENCES queue_entries(id) ON DELETE CASCADE,
  old_status queue_status,
  new_status queue_status NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  changed_by_name TEXT,
  notes TEXT,
  doca TEXT,
  previsao_descarregamento TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_entries_status ON queue_entries(status);
CREATE INDEX IF NOT EXISTS idx_queue_entries_token ON queue_entries(token);
CREATE INDEX IF NOT EXISTS idx_queue_entries_created_at ON queue_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_queue_entries_placa ON queue_entries(placa);
CREATE INDEX IF NOT EXISTS idx_queue_history_entry ON queue_history(queue_entry_id);
CREATE INDEX IF NOT EXISTS idx_queue_history_created ON queue_history(created_at);

INSERT INTO settings (key, value) VALUES (
  'geofence',
  '{"lat": -23.5505, "lng": -46.6333, "radius_meters": 500, "name": "LSL - Centro de Descarga"}'
) ON CONFLICT (key) DO NOTHING;
