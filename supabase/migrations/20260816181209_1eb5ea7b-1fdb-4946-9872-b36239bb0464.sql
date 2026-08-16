CREATE OR REPLACE VIEW private.driver_company_access
WITH (security_invoker = false)
AS
SELECT DISTINCT
  dd.user_id,
  d.company_id
FROM public.deliveries d
JOIN public.delivery_drivers dd
  ON d.driver_id = dd.id
  OR (
    d.driver_id IS NULL
    AND d.status IN ('pending'::public.delivery_status, 'broadcasted'::public.delivery_status)
  )
WHERE d.company_id IS NOT NULL;

REVOKE ALL ON private.driver_company_access FROM PUBLIC;
REVOKE ALL ON private.driver_company_access FROM anon;
GRANT SELECT ON private.driver_company_access TO authenticated;
GRANT SELECT ON private.driver_company_access TO service_role;

DROP POLICY IF EXISTS "Drivers read companies of their deliveries" ON public.companies;
CREATE POLICY "Drivers read companies of their deliveries"
ON public.companies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM private.driver_company_access access
    WHERE access.company_id = companies.id
      AND access.user_id = auth.uid()
  )
);

DROP FUNCTION IF EXISTS private.driver_can_read_company(uuid, uuid);