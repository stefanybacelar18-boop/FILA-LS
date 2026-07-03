-- PARTE 2 de 3 — Funções e triggers
-- Rode DEPOIS da parte 1, em nova execução (nova aba ou após sucesso da parte 1)

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE OR REPLACE FUNCTION trigger_recalculate_positions()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalculate_queue_positions();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'operador')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS queue_entries_updated_at ON queue_entries;
CREATE TRIGGER queue_entries_updated_at BEFORE UPDATE ON queue_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS settings_updated_at ON settings;
CREATE TRIGGER settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS queue_status_history ON queue_entries;
CREATE TRIGGER queue_status_history AFTER UPDATE ON queue_entries
  FOR EACH ROW EXECUTE FUNCTION log_queue_status_change();

DROP TRIGGER IF EXISTS recalc_positions_after_insert ON queue_entries;
CREATE TRIGGER recalc_positions_after_insert
  AFTER INSERT ON queue_entries
  FOR EACH STATEMENT EXECUTE FUNCTION trigger_recalculate_positions();

DROP TRIGGER IF EXISTS recalc_positions_after_update ON queue_entries;
CREATE TRIGGER recalc_positions_after_update
  AFTER UPDATE OF status ON queue_entries
  FOR EACH STATEMENT EXECUTE FUNCTION trigger_recalculate_positions();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE queue_entries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
