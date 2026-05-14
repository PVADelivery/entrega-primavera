
-- Make this app driver-only: new signups get driver role + driver row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  default_region UUID;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'driver'::public.app_role)
  ON CONFLICT DO NOTHING;

  SELECT id INTO default_region FROM public.regions WHERE is_active = true ORDER BY created_at LIMIT 1;

  INSERT INTO public.delivery_drivers (user_id, region_id, vehicle, vehicle_type)
  VALUES (NEW.id, default_region, 'Moto', 'motorcycle')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure delivery status change trigger exists
DROP TRIGGER IF EXISTS trg_delivery_status_change ON public.deliveries;
CREATE TRIGGER trg_delivery_status_change
BEFORE UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.on_delivery_status_change();

DROP TRIGGER IF EXISTS trg_delivery_completed ON public.deliveries;
CREATE TRIGGER trg_delivery_completed
AFTER UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.notify_delivery_completed();

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_drivers_updated_at ON public.delivery_drivers;
CREATE TRIGGER trg_drivers_updated_at BEFORE UPDATE ON public.delivery_drivers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_deliveries_updated_at ON public.deliveries;
CREATE TRIGGER trg_deliveries_updated_at BEFORE UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: a company in the default region (no owner needed)
INSERT INTO public.companies (name, address, phone, region_id)
SELECT 'Restaurante Demo', 'Rua das Flores, 123 - Centro', '(11) 99999-0000', r.id
FROM public.regions r
WHERE r.is_active = true
AND NOT EXISTS (SELECT 1 FROM public.companies WHERE name = 'Restaurante Demo')
LIMIT 1;

-- Seed: pending deliveries available for any driver in the region
INSERT INTO public.deliveries (company_id, region_id, customer_name, customer_phone, address, value, commission, status, latitude, longitude)
SELECT c.id, c.region_id, x.cname, x.cphone, x.caddr, x.cval, x.ccom, 'pending'::delivery_status, x.lat, x.lng
FROM public.companies c
CROSS JOIN (VALUES
  ('Maria Silva',  '(11) 98888-1111', 'Rua Augusta, 456 - Consolação',  18.50, 14.80, -23.5510, -46.6420),
  ('João Santos',  '(11) 97777-2222', 'Av. Paulista, 1000 - Bela Vista', 22.00, 17.60, -23.5613, -46.6560),
  ('Ana Costa',    '(11) 96666-3333', 'Rua Oscar Freire, 200 - Jardins', 15.00, 12.00, -23.5630, -46.6700),
  ('Pedro Lima',   '(11) 95555-4444', 'Rua da Consolação, 800',          25.00, 20.00, -23.5520, -46.6450)
) AS x(cname, cphone, caddr, cval, ccom, lat, lng)
WHERE c.name = 'Restaurante Demo'
AND NOT EXISTS (SELECT 1 FROM public.deliveries WHERE customer_name = x.cname AND status = 'pending');
