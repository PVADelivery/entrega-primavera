
-- 1) Lock down SECURITY DEFINER trigger functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_delivery_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_delivery_completed() FROM PUBLIC, anon, authenticated;
-- has_role is referenced by RLS, keep it callable by authenticated only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- 2) driver_invites: remove broad public SELECT
DROP POLICY IF EXISTS "Invites readable by anyone with token (via fn)" ON public.driver_invites;
-- Admins policy already exists ("Admins manage invites"). Token lookup should go through a SECURITY DEFINER RPC.

-- 3) avatars bucket: add DELETE + ensure update scoped (already scoped)
CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 4) occurrences bucket: explicit DELETE + UPDATE policies (driver own folder)
CREATE POLICY "Driver updates own occurrence files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'occurrences' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'occurrences' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Driver deletes own occurrence files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'occurrences' AND (auth.uid())::text = (storage.foldername(name))[1]);
