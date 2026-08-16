BEGIN;

-- Helpers de autorização executam como o proprietário da função para que as
-- consultas internas não reavaliem as políticas das tabelas consultadas.
CREATE OR REPLACE FUNCTION public.get_driver_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.delivery_drivers
  WHERE user_id = _user_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_owns_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies
    WHERE id = _company_id
      AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.driver_can_read_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deliveries d
    JOIN public.delivery_drivers dd ON dd.user_id = _user_id
    WHERE d.company_id = _company_id
      AND (
        d.driver_id = dd.id
        OR (
          d.driver_id IS NULL
          AND d.status::text IN ('pending', 'broadcasted')
        )
      )
  )
$$;

-- Operação usada pelo app do entregador. A função valida a identidade antes de
-- atualizar e não força uma nova avaliação das policies de deliveries.
CREATE OR REPLACE FUNCTION public.update_delivery_status_safe(
  p_delivery_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_driver uuid;
  current_status text;
BEGIN
  SELECT id INTO current_driver
  FROM public.delivery_drivers
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF current_driver IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found';
  END IF;

  SELECT status::text INTO current_status
  FROM public.deliveries
  WHERE id = p_delivery_id
    AND driver_id = current_driver;

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Delivery not assigned to authenticated driver';
  END IF;

  IF p_status NOT IN ('accepted', 'collecting', 'in_transit', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid delivery status';
  END IF;

  IF NOT (
    (current_status IN ('pending', 'broadcasted') AND p_status IN ('accepted', 'cancelled'))
    OR (current_status = 'accepted' AND p_status IN ('collecting', 'cancelled'))
    OR (current_status IN ('collecting', 'picked_up') AND p_status IN ('in_transit', 'cancelled'))
    OR (current_status IN ('in_transit', 'in_route') AND p_status IN ('delivered', 'cancelled'))
    OR current_status = p_status
  ) THEN
    RAISE EXCEPTION 'Invalid delivery status transition';
  END IF;

  UPDATE public.deliveries
  SET status = p_status::public.delivery_status,
      accepted_at = CASE WHEN p_status = 'accepted' THEN now() ELSE accepted_at END,
      collected_at = CASE WHEN p_status = 'collecting' THEN now() ELSE collected_at END,
      completed_at = CASE WHEN p_status = 'delivered' THEN now() ELSE completed_at END,
      cancelled_at = CASE WHEN p_status = 'cancelled' THEN now() ELSE cancelled_at END,
      updated_at = now()
  WHERE id = p_delivery_id
    AND driver_id = current_driver;

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_owns_company(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_can_read_company(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_delivery_status_safe(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_owns_company(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_can_read_company(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_delivery_status_safe(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Drivers read companies of their deliveries" ON public.companies;
DROP POLICY IF EXISTS "drivers_read_delivery_companies" ON public.companies;
CREATE POLICY "Drivers read companies of their deliveries"
ON public.companies
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.driver_can_read_company(auth.uid(), id)
);

DROP POLICY IF EXISTS "Driver sees available or own deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "drivers_select_deliveries" ON public.deliveries;
CREATE POLICY "Driver sees available or own deliveries"
ON public.deliveries
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.user_owns_company(auth.uid(), company_id)
  OR driver_id = public.get_driver_id(auth.uid())
  OR (
    driver_id IS NULL
    AND status::text IN ('pending', 'broadcasted')
    AND EXISTS (
      SELECT 1
      FROM public.delivery_drivers dd
      WHERE dd.id = public.get_driver_id(auth.uid())
        AND (
          dd.region_id IS NULL
          OR deliveries.region_id IS NULL
          OR dd.region_id = deliveries.region_id
        )
    )
  )
);

DROP POLICY IF EXISTS "Driver updates own or claims pending" ON public.deliveries;
DROP POLICY IF EXISTS "drivers_update_deliveries" ON public.deliveries;
CREATE POLICY "Driver updates own or claims pending"
ON public.deliveries
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.user_owns_company(auth.uid(), company_id)
  OR driver_id = public.get_driver_id(auth.uid())
  OR (driver_id IS NULL AND status::text IN ('pending', 'broadcasted'))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.user_owns_company(auth.uid(), company_id)
  OR driver_id = public.get_driver_id(auth.uid())
);

COMMIT;