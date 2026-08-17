CREATE OR REPLACE FUNCTION public.company_can_read_driver(_user_id uuid, _driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deliveries d
    JOIN public.companies c ON c.id = d.company_id
    WHERE d.driver_id = _driver_id
      AND c.user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.company_can_read_driver(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_can_read_driver(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Drivers see own profile" ON public.delivery_drivers;
CREATE POLICY "Drivers see own profile"
ON public.delivery_drivers FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'company') AND public.company_can_read_driver(auth.uid(), id))
);