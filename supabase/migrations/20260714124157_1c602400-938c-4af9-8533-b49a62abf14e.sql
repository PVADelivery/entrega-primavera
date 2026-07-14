
DROP POLICY IF EXISTS "Chat mark read" ON public.chat_messages;

CREATE POLICY "Chat mark read"
ON public.chat_messages
FOR UPDATE
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);

CREATE OR REPLACE FUNCTION public.enforce_chat_messages_readonly()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.delivery_id IS DISTINCT FROM OLD.delivery_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.id IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION 'Only read_at can be updated on chat_messages';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_readonly_guard ON public.chat_messages;
CREATE TRIGGER chat_messages_readonly_guard
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_chat_messages_readonly();
