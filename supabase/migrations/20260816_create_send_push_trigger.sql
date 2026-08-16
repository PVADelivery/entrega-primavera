-- ==============================================================================
-- TRIGGER SQL OFICIAL PARA O BANCO DO PRIMAVERA (owlbzwsdcognrgolvnzg)
-- IDÊNTICO AO SISTEMA DO É PRA JÁ COM URL E CHAVE DO PROJETO PRIMAVERA
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trigger_send_push_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_name TEXT := 'Loja Parceira';
  v_pickup_addr TEXT := 'Retirada na Loja';
  v_dropoff_addr TEXT := 'Endereço do Cliente';
  v_delivery_fee NUMERIC := 0;
  v_order RECORD;
  v_company RECORD;
  v_details TEXT;
  v_payload JSONB;
BEGIN
  -- Só executa se o status for 'pending' (nova entrega disponível para entregadores)
  IF NEW.status <> 'pending' AND NEW.status <> 'broadcasted' THEN
    RETURN NEW;
  END IF;

  -- Se for UPDATE, só executa se o status MUDOU para 'pending' ou 'broadcasted'
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT NULL AND (OLD.status = 'pending' OR OLD.status = 'broadcasted') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- 1. Se o registro da entrega possuir order_id, busca os dados reais do pedido
  IF NEW.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id LIMIT 1;
    IF FOUND THEN
      IF v_order.company_name IS NOT NULL AND v_order.company_name <> '' THEN
        v_company_name := v_order.company_name;
      ELSIF v_order.store_name IS NOT NULL AND v_order.store_name <> '' THEN
        v_company_name := v_order.store_name;
      END IF;

      IF v_order.delivery_address IS NOT NULL AND v_order.delivery_address <> '' THEN
        v_dropoff_addr := v_order.delivery_address;
      ELSIF v_order.customer_address IS NOT NULL AND v_order.customer_address <> '' THEN
        v_dropoff_addr := v_order.customer_address;
      ELSIF v_order.street IS NOT NULL AND v_order.street <> '' THEN
        v_dropoff_addr := v_order.street || ', ' || COALESCE(v_order.number, 'S/N') || COALESCE(' - ' || v_order.neighborhood, '');
      END IF;

      v_delivery_fee := COALESCE(v_order.delivery_fee, v_order.shipping_fee, v_order.driver_fee, 0);
      
      IF NEW.company_id IS NULL AND v_order.company_id IS NOT NULL THEN
        NEW.company_id := v_order.company_id;
      END IF;
    END IF;
  END IF;

  -- 2. Se possuir company_id, busca nome e endereço oficial da empresa
  IF NEW.company_id IS NOT NULL THEN
    SELECT name, address INTO v_company FROM public.companies WHERE id = NEW.company_id LIMIT 1;
    IF FOUND THEN
      IF v_company.name IS NOT NULL AND v_company.name <> '' THEN
        v_company_name := v_company.name;
      END IF;

      IF v_company.address IS NOT NULL AND v_company.address <> '' THEN
        v_pickup_addr := v_company.address;
      END IF;
    END IF;
  END IF;

  -- Preenche os valores caso o registro da entrega já tenha campos nativos
  IF NEW.pickup_address IS NOT NULL AND NEW.pickup_address <> '' THEN v_pickup_addr := NEW.pickup_address; END IF;
  IF NEW.delivery_address IS NOT NULL AND NEW.delivery_address <> '' THEN v_dropoff_addr := NEW.delivery_address; END IF;
  IF COALESCE(NEW.delivery_fee, 0) > 0 THEN v_delivery_fee := NEW.delivery_fee; END IF;
  IF COALESCE(NEW.value, 0) > 0 THEN v_delivery_fee := NEW.value; END IF;

  -- Formata a mensagem completa de 4 linhas
  v_details := '🏬 Loja: ' || v_company_name || chr(10) ||
               '📍 Coleta: ' || v_pickup_addr || chr(10) ||
               '🏁 Entrega: ' || v_dropoff_addr || chr(10) ||
               '💰 Ganhos: R$ ' || REPLACE(TO_CHAR(v_delivery_fee, 'FM9990.00'), '.', ',');

  -- Constrói o JSON com todos os dados explicitados
  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              row_to_json(NEW)::jsonb,
              '{address}', to_jsonb(v_details)
            ),
            '{details}', to_jsonb(v_details)
          ),
          '{company_name}', to_jsonb(v_company_name)
        ),
        '{store_name}', to_jsonb(v_company_name)
      ),
      '{delivery_address}', to_jsonb(v_dropoff_addr)
    ),
    'old_record', null
  );

  -- Realiza o disparo HTTP POST direto para a Edge Function send-push do Primavera
  PERFORM net.http_post(
      url := 'https://owlbzwsdcognrgolvnzg.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3OiOiJzdXBhYmFzZSIsInJlZiI6Im93bGJ6d3NkY29nbnJnb2x2bnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTQ1NTMsImV4cCI6MjA5NTU3MDU1M30.R6-FUqubIr3uABzv1CS7jiS5cwygrNiIqk4oNbq7O44'
      ),
      body := v_payload
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Push notification webhook failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Recria o trigger na tabela deliveries para INSERT e UPDATE
DROP TRIGGER IF EXISTS trg_send_push_on_delivery ON public.deliveries;
CREATE TRIGGER trg_send_push_on_delivery
  AFTER INSERT OR UPDATE ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push_on_delivery();
