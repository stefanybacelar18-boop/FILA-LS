-- PARTE 3 de 3 — Políticas de segurança (RLS)
-- Rode DEPOIS da parte 2

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON profiles;
CREATE POLICY "Profiles readable by authenticated" ON profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins manage profiles" ON profiles;
CREATE POLICY "Admins manage profiles" ON profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'administrador')
  );

DROP POLICY IF EXISTS "Geofence readable by all" ON settings;
CREATE POLICY "Geofence readable by all" ON settings
  FOR SELECT USING (key = 'geofence');

DROP POLICY IF EXISTS "Settings readable by staff" ON settings;
CREATE POLICY "Settings readable by staff" ON settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('supervisor', 'administrador')
    )
  );

DROP POLICY IF EXISTS "Settings writable by admin" ON settings;
CREATE POLICY "Settings writable by admin" ON settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('supervisor', 'administrador')
    )
  );

DROP POLICY IF EXISTS "Public check-in insert" ON queue_entries;
CREATE POLICY "Public check-in insert" ON queue_entries
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public read by token" ON queue_entries;
CREATE POLICY "Public read by token" ON queue_entries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Staff update queue" ON queue_entries;
CREATE POLICY "Staff update queue" ON queue_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('operador', 'supervisor', 'administrador')
    )
  );

DROP POLICY IF EXISTS "History readable" ON queue_history;
CREATE POLICY "History readable" ON queue_history
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Staff insert history notes" ON queue_history;
CREATE POLICY "Staff insert history notes" ON queue_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('operador', 'supervisor', 'administrador')
    )
  );
