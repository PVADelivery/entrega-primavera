DROP POLICY IF EXISTS "Authenticated can broadcast on own topics" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can read own-topic messages" ON realtime.messages;

CREATE POLICY "Authenticated can broadcast on own topics"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  realtime.topic() = ('user:' || (auth.uid())::text)
  OR realtime.topic() LIKE ('user:' || (auth.uid())::text || ':%')
);

CREATE POLICY "Authenticated can read own-topic messages"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() = ('user:' || (auth.uid())::text)
  OR realtime.topic() LIKE ('user:' || (auth.uid())::text || ':%')
);