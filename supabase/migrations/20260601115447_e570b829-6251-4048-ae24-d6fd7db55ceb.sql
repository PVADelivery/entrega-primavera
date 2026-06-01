
-- Restrict realtime subscriptions to topics that include the user's own id
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read own-topic messages" ON realtime.messages;
CREATE POLICY "Authenticated can read own-topic messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE '%' || (auth.uid())::text || '%'
);

DROP POLICY IF EXISTS "Authenticated can broadcast on own topics" ON realtime.messages;
CREATE POLICY "Authenticated can broadcast on own topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE '%' || (auth.uid())::text || '%'
);
