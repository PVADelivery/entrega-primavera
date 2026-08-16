BEGIN;

CREATE OR REPLACE FUNCTION public.get_driver_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.delivery_drivers WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_owns_company(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id AND user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.driver_can_read_company(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deliveries d
    JOIN public.delivery_drivers dd ON dd.user_id = _user_id
    WHERE d.company_id = _company_id
      AND (d.driver_id = dd.id
           OR (d.driver_id IS NULL AND d.status::text IN ('pending','broadcasted')))
  )
$$;

REVOKE ALL ON FUNCTION public.get_driver_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_owns_company(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_can_read_company(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_owns_company(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_can_read_company(uuid, uuid) TO authenticated, service_role;

-- COMPANIES
DROP POLICY IF EXISTS "Drivers read companies of their deliveries" ON public.companies;
DROP POLICY IF EXISTS "drivers_read_delivery_companies" ON public.companies;
CREATE POLICY "Drivers read companies of their deliveries"
ON public.companies FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.driver_can_read_company(auth.uid(), id)
);

-- DELIVERIES (sem region_id, sem referência cruzada recursiva)
DROP POLICY IF EXISTS "Driver sees available or own deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "drivers_select_deliveries" ON public.deliveries;
CREATE POLICY "Driver sees available or own deliveries"
ON public.deliveries FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.user_owns_company(auth.uid(), company_id)
  OR driver_id = public.get_driver_id(auth.uid())
  OR (driver_id IS NULL AND status::text IN ('pending','broadcasted'))
);

DROP POLICY IF EXISTS "Driver updates own or claims pending" ON public.deliveries;
DROP POLICY IF EXISTS "drivers_update_deliveries" ON public.deliveries;
CREATE POLICY "Driver updates own or claims pending"
ON public.deliveries FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.user_owns_company(auth.uid(), company_id)
  OR driver_id = public.get_driver_id(auth.uid())
  OR (driver_id IS NULL AND status::text IN ('pending','broadcasted'))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.user_owns_company(auth.uid(), company_id)
  OR driver_id = public.get_driver_id(auth.uid())
);

COMMIT;
