DROP POLICY IF EXISTS "Drivers read companies of their deliveries" ON public.companies;

CREATE POLICY "Drivers read companies of their deliveries"
ON public.companies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.deliveries d
    JOIN public.delivery_drivers dd ON dd.user_id = auth.uid()
    WHERE d.company_id = companies.id
      AND (
        d.driver_id = dd.id
        OR (d.status IN ('pending','broadcasted') AND d.driver_id IS NULL)
      )
  )
);