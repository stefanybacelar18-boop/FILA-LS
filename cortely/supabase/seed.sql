-- Seed demo Cortely — barbearia "Navalha Negra"
-- Rode após schema.sql num projeto Supabase isolado.

INSERT INTO public.barbershops (
  id, name, slug, phone, logo_url, banner_url, address, primary_color,
  loyalty_threshold, loyalty_reward
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Navalha Negra',
  'navalha-negra',
  '11999998888',
  NULL,
  NULL,
  'Rua Augusta, 1200 — São Paulo, SP',
  '#d97706',
  5,
  '6º corte com 50% de desconto'
);

INSERT INTO public.barbers (id, barbershop_id, name, avatar_url, specialties, is_active) VALUES
  ('22222222-2222-4222-8222-222222222221', '11111111-1111-4111-8111-111111111111', 'Rafael Costa', NULL, ARRAY['Fade', 'Barba'], true),
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Diego Santos', NULL, ARRAY['Social', 'Degradê'], true),
  ('22222222-2222-4222-8222-222222222223', '11111111-1111-4111-8111-111111111111', 'Lucas Mendes', NULL, ARRAY['Navalhado', 'Sobrancelha'], true);

INSERT INTO public.services (id, barbershop_id, name, description, duration_minutes, price, category) VALUES
  ('33333333-3333-4333-8333-333333333331', '11111111-1111-4111-8111-111111111111', 'Corte Clássico', 'Máquina + tesoura com acabamento', 40, 55.00, 'Cabelo'),
  ('33333333-3333-4333-8333-333333333332', '11111111-1111-4111-8111-111111111111', 'Corte + Barba', 'Combo completo com toalha quente', 70, 90.00, 'Combo'),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Barba Completa', 'Aparar, desenhar e hidratar', 30, 40.00, 'Barba'),
  ('33333333-3333-4333-8333-333333333334', '11111111-1111-4111-8111-111111111111', 'Fade Premium', 'Degradê alto com detalhe navalha', 50, 70.00, 'Cabelo');

-- Seg–Sáb 09:00–19:00, pausa 12:00–13:00
INSERT INTO public.working_hours (barber_id, day_of_week, start_time, end_time, break_start, break_end)
SELECT b.id, d.day, '09:00'::time, '19:00'::time, '12:00'::time, '13:00'::time
FROM public.barbers b
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6)) AS d(day)
WHERE b.barbershop_id = '11111111-1111-4111-8111-111111111111';
