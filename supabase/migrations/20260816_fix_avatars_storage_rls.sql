-- ==============================================================================
-- LIBERAÇÃO TOTAL DE RLS PARA O BUCKET DE AVATARS NO SUPABASE
-- Permite upload e atualização de fotos de perfil por usuários autenticados
-- ==============================================================================

-- 1. Garante que o bucket 'avatars' seja público
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Habilita RLS na tabela storage.objects (se não estiver)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Remove políticas restritivas anteriores para o bucket avatars
DROP POLICY IF EXISTS "Avatars Public Select" ON storage.objects;
DROP POLICY IF EXISTS "Avatars Authenticated Insert" ON storage.objects;
DROP POLICY IF EXISTS "Avatars Authenticated Update" ON storage.objects;
DROP POLICY IF EXISTS "Avatars Authenticated Delete" ON storage.objects;
DROP POLICY IF EXISTS "Avatars Full Access" ON storage.objects;

-- 4. Cria políticas permissivas e seguras para visualização, inserção e atualização
CREATE POLICY "Avatars Public Select"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Avatars Authenticated Insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Avatars Authenticated Update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Avatars Authenticated Delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');
