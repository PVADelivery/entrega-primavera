
-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.app_role AS ENUM ('admin', 'company', 'driver', 'customer');
CREATE TYPE public.delivery_status AS ENUM ('pending','broadcasted','accepted','collecting','in_transit','delivered','cancelled','returned');
CREATE TYPE public.occurrence_type AS ENUM ('motorcycle_issue','accident','robbery','other');

-- =========================================
-- UTIL: updated_at
-- =========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================
-- PROFILES
-- =========================================
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by owner" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- USER_ROLES + has_role
-- =========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- handle_new_user trigger
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer'::public.app_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- REGIONS
-- =========================================
CREATE TABLE public.regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Regions readable by authenticated" ON public.regions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage regions" ON public.regions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- COMPANIES
-- =========================================
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  region_id UUID REFERENCES public.regions(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies readable by authenticated" ON public.companies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owner updates own company" ON public.companies
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage companies" ON public.companies
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_companies_updated
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- CUSTOMERS + ADDRESSES
-- =========================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own customer record" ON public.customers
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users insert own customer" ON public.customers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own customer" ON public.customers
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  region_id UUID REFERENCES public.regions(id),
  is_default BOOLEAN NOT NULL DEFAULT false,
  label TEXT
);
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own addresses" ON public.addresses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin')
  );
CREATE POLICY "Users manage own addresses" ON public.addresses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.user_id = auth.uid())
  );

-- =========================================
-- DELIVERY_DRIVERS
-- =========================================
CREATE TABLE public.delivery_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  region_id UUID REFERENCES public.regions(id),
  vehicle TEXT,
  vehicle_type TEXT,
  vehicle_plate TEXT,
  license_plate TEXT,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 80.00,
  is_online BOOLEAN NOT NULL DEFAULT false,
  online BOOLEAN NOT NULL DEFAULT false,
  rating NUMERIC(3,2) DEFAULT 5.00,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers see own profile" ON public.delivery_drivers
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'company')
  );
CREATE POLICY "Driver inserts own row" ON public.delivery_drivers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Driver updates own row" ON public.delivery_drivers
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage drivers" ON public.delivery_drivers
  FOR ALL USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_drivers_updated
  BEFORE UPDATE ON public.delivery_drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- DELIVERIES
-- =========================================
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  driver_id UUID REFERENCES public.delivery_drivers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status public.delivery_status NOT NULL DEFAULT 'pending',
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  region_id UUID REFERENCES public.regions(id),
  accepted_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- Driver can SEE pending in their region OR own deliveries
CREATE POLICY "Driver sees available or own deliveries" ON public.deliveries
  FOR SELECT USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1 FROM public.delivery_drivers d
      WHERE d.user_id = auth.uid()
        AND (
          deliveries.driver_id = d.id
          OR (deliveries.status = 'pending' AND deliveries.driver_id IS NULL
              AND (d.region_id IS NULL OR deliveries.region_id IS NULL OR deliveries.region_id = d.region_id))
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c WHERE c.id = deliveries.company_id AND c.user_id = auth.uid()
    )
  );

-- Driver accepts/updates own delivery
CREATE POLICY "Driver updates own or claims pending" ON public.deliveries
  FOR UPDATE USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1 FROM public.delivery_drivers d
      WHERE d.user_id = auth.uid()
        AND (deliveries.driver_id = d.id OR (deliveries.status='pending' AND deliveries.driver_id IS NULL))
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c WHERE c.id = deliveries.company_id AND c.user_id = auth.uid()
    )
  );

-- Companies/admins create deliveries
CREATE POLICY "Companies create deliveries" ON public.deliveries
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = deliveries.company_id AND c.user_id = auth.uid())
  );

CREATE TRIGGER trg_deliveries_updated
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: ao concluir, marca completed_at e cria notificação
CREATE OR REPLACE FUNCTION public.on_delivery_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  driver_user UUID;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    NEW.completed_at = now();
  END IF;
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    NEW.cancelled_at = now();
  END IF;
  IF NEW.status = 'collecting' AND (OLD.status IS DISTINCT FROM 'collecting') THEN
    NEW.collected_at = COALESCE(NEW.collected_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_status
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.on_delivery_status_change();

CREATE OR REPLACE FUNCTION public.notify_delivery_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  driver_user UUID;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    SELECT user_id INTO driver_user FROM public.delivery_drivers WHERE id = NEW.driver_id;
    IF driver_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, title, body, type, data)
      VALUES (driver_user, 'Entrega concluída', 'Você concluiu uma entrega.', 'delivery_completed',
              jsonb_build_object('delivery_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- =========================================
-- ORDERS
-- =========================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  customer_id UUID REFERENCES public.customers(id),
  delivery_id UUID REFERENCES public.deliveries(id),
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Orders visible to involved parties" ON public.orders
  FOR SELECT USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = orders.company_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers cu WHERE cu.id = orders.customer_id AND cu.user_id = auth.uid())
  );

-- =========================================
-- REVIEWS
-- =========================================
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.delivery_drivers(id),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reviews readable by driver/admin" ON public.reviews
  FOR SELECT USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.delivery_drivers d WHERE d.id = reviews.driver_id AND d.user_id = auth.uid())
  );

-- =========================================
-- OCCURRENCES
-- =========================================
CREATE TABLE public.occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL,
  type public.occurrence_type NOT NULL,
  description TEXT NOT NULL,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Driver sees own occurrences" ON public.occurrences
  FOR SELECT USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.delivery_drivers d WHERE d.id = occurrences.driver_id AND d.user_id = auth.uid())
  );
CREATE POLICY "Driver inserts own occurrence" ON public.occurrences
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.delivery_drivers d WHERE d.id = occurrences.driver_id AND d.user_id = auth.uid())
  );
CREATE POLICY "Driver updates own occurrence" ON public.occurrences
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.delivery_drivers d WHERE d.id = occurrences.driver_id AND d.user_id = auth.uid())
  );

-- =========================================
-- CHAT_MESSAGES
-- =========================================
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat visible to participants" ON public.chat_messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Chat send as self" ON public.chat_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Chat mark read" ON public.chat_messages
  FOR UPDATE USING (auth.uid() = receiver_id);

-- =========================================
-- NOTIFICATIONS
-- =========================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT,
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users mark own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER trg_notify_completed
  AFTER UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.notify_delivery_completed();

-- =========================================
-- DRIVER_INVITES
-- =========================================
CREATE TABLE public.driver_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT,
  region_id UUID REFERENCES public.regions(id),
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invites readable by anyone with token (via fn)" ON public.driver_invites
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage invites" ON public.driver_invites
  FOR ALL USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================
-- REALTIME
-- =========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_drivers;

ALTER TABLE public.deliveries REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_drivers REPLICA IDENTITY FULL;

-- =========================================
-- STORAGE BUCKETS
-- =========================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('occurrences','occurrences', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Driver reads own occurrence files" ON storage.objects
  FOR SELECT USING (bucket_id = 'occurrences' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Driver uploads occurrence files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'occurrences' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =========================================
-- SEED de uma região default
-- =========================================
INSERT INTO public.regions (name, city, state) VALUES ('Centro', 'São Paulo', 'SP');
