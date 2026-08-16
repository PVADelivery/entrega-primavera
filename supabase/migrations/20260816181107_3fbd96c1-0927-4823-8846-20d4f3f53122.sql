CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION private.driver_can_read_company(_company_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deliveries d
    JOIN public.delivery_drivers dd
      ON dd.user_id = _user_id
    WHERE d.company_id = _company_id
      AND (
        d.driver_id = dd.id
        OR (
          d.status IN ('pending'::public.delivery_status, 'broadcasted'::public.delivery_status)
          AND d.driver_id IS NULL
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.driver_can_read_company(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.driver_can_read_company(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION private.driver_can_read_company(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.driver_can_read_company(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "Drivers read companies of their deliveries" ON public.companies;
CREATE POLICY "Drivers read companies of their deliveries"
ON public.companies
FOR SELECT
TO authenticated
USING (private.driver_can_read_company(id, auth.uid()));

DROP FUNCTION IF EXISTS public.driver_can_read_company(uuid, uuid);