
DROP POLICY IF EXISTS "Companies readable by authenticated" ON public.companies;

CREATE POLICY "Owner reads own company" ON public.companies
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Drivers read companies of their deliveries" ON public.companies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.deliveries d
    JOIN public.delivery_drivers dd ON dd.id = d.driver_id
    WHERE d.company_id = companies.id AND dd.user_id = auth.uid()
  ));
