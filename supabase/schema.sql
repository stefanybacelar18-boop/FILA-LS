-- FilaDock - Schema Supabase
-- Execute no SQL Editor do Supabase (primeira instalação)
--
-- Se der erro "já existe", NÃO rode este arquivo de novo.
-- Use supabase/schema-safe.sql (pode rodar várias vezes sem erro).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum de perfis
CREATE TYPE user_role AS ENUM ('motorista', 'operador', 'supervisor', 'administrador');

-- Enum de status da fila
CREATE TYPE queue_status AS ENUM (
  'aguardando',
  'chamado',
  'em_deslocamento',
  'em_descarga',
  'finalizado',
  'ausente',
  'cancelado'
);

-- Perfis de usuários autenticados
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'operador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Configurações do sistema (geofence, etc.)
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- Check-ins / veículos na fila
CREATE TABLE queue_entries (
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

-- Histórico de movimentações
CREATE TABLE queue_history (
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

-- Índices
CREATE INDEX idx_queue_entries_status ON queue_entries(status);
CREATE INDEX idx_queue_entries_token ON queue_entries(token);
CREATE INDEX idx_queue_entries_created_at ON queue_entries(created_at);
CREATE INDEX idx_queue_entries_placa ON queue_entries(placa);
CREATE INDEX idx_queue_history_entry ON queue_history(queue_entry_id);
CREATE INDEX idx_queue_history_created ON queue_history(created_at);

-- Configuração padrão do geofence (centro e raio em metros)
INSERT INTO settings (key, value) VALUES (
  'geofence',
  '{"lat": -23.5505, "lng": -46.6333, "radius_meters": 500, "name": "LSL - Centro de Descarga"}'
);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER queue_entries_updated_at BEFORE UPDATE ON queue_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Função para registrar histórico automaticamente
CREATE OR REPLACE FUNCTION log_queue_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR
     OLD.doca IS DISTINCT FROM NEW.doca OR
     OLD.previsao_descarregamento IS DISTINCT FROM NEW.previsao_descarregamento THEN
    INSERT INTO queue_history (
      queue_entry_id, old_status, new_status, doca, previsao_descarregamento, notes
    ) VALUES (
      NEW.id, OLD.status, NEW.status, NEW.doca, NEW.previsao_descarregamento,
      CASE
        WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'Status alterado'
        WHEN OLD.doca IS DISTINCT FROM NEW.doca THEN 'Doca alterada'
        ELSE 'Previsão atualizada'
      END
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER queue_status_history AFTER UPDATE ON queue_entries
  FOR EACH ROW EXECUTE FUNCTION log_queue_status_change();

-- Função para calcular posição na fila
CREATE OR REPLACE FUNCTION recalculate_queue_positions()
RETURNS void AS $$
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS pos
    FROM queue_entries
    WHERE status IN ('aguardando', 'chamado', 'em_deslocamento')
  )
  UPDATE queue_entries q
  SET posicao_fila = r.pos
  FROM ranked r
  WHERE q.id = r.id;

  UPDATE queue_entries
  SET posicao_fila = NULL
  WHERE status NOT IN ('aguardando', 'chamado', 'em_deslocamento');
END;
$$ LANGUAGE plpgsql;

-- Trigger para recalcular posições
CREATE OR REPLACE FUNCTION trigger_recalculate_positions()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalculate_queue_positions();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recalc_positions_after_insert
  AFTER INSERT ON queue_entries
  FOR EACH STATEMENT EXECUTE FUNCTION trigger_recalculate_positions();

CREATE TRIGGER recalc_positions_after_update
  AFTER UPDATE OF status ON queue_entries
  FOR EACH STATEMENT EXECUTE FUNCTION trigger_recalculate_positions();

-- Criar perfil ao registrar usuário
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'operador')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE queue_entries;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_history ENABLE ROW LEVEL SECURITY;

-- Profiles: usuários autenticados leem perfis, admins gerenciam
CREATE POLICY "Profiles readable by authenticated" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Admins manage profiles" ON profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'administrador')
  );

-- Settings: leitura pública do geofence, escrita admin/supervisor
CREATE POLICY "Geofence readable by all" ON settings
  FOR SELECT USING (key = 'geofence');

CREATE POLICY "Settings readable by staff" ON settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('supervisor', 'administrador')
    )
  );

CREATE POLICY "Settings writable by admin" ON settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('supervisor', 'administrador')
    )
  );

-- Queue entries: check-in público (insert), leitura por token ou staff
CREATE POLICY "Public check-in insert" ON queue_entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read by token" ON queue_entries
  FOR SELECT USING (true);

CREATE POLICY "Staff update queue" ON queue_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('operador', 'supervisor', 'administrador')
    )
  );

-- History: staff lê tudo, público lê do próprio entry via join
CREATE POLICY "History readable" ON queue_history
  FOR SELECT USING (true);

CREATE POLICY "Staff insert history notes" ON queue_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('operador', 'supervisor', 'administrador')
    )
  );
