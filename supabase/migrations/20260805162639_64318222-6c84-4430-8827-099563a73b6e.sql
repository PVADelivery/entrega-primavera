REVOKE UPDATE ON public.chat_messages FROM authenticated;
REVOKE UPDATE ON public.chat_messages FROM anon;
GRANT UPDATE (read_at) ON public.chat_messages TO authenticated;

DROP POLICY IF EXISTS "Chat mark read" ON public.chat_messages;
CREATE POLICY "Chat mark read" ON public.chat_messages
FOR UPDATE TO authenticated
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);