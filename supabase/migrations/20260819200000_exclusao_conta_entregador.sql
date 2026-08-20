-- ============================================================================
-- SCRIPT DE EXCLUSÃO DEFINITIVA DE CONTA DO ENTREGADOR
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_driver_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'ID do usuário não informado.';
  END IF;

  SELECT id INTO v_driver_id
    FROM public.delivery_drivers
   WHERE user_id = p_user_id OR id = p_user_id
   LIMIT 1;

  IF v_driver_id IS NOT NULL THEN
    UPDATE public.deliveries
       SET driver_id = NULL,
           status = 'pending'::public.delivery_status,
           updated_at = now()
     WHERE driver_id = v_driver_id
       AND status IN ('accepted'::public.delivery_status, 'collecting'::public.delivery_status, 'in_route'::public.delivery_status);

    UPDATE public.deliveries
       SET driver_id = NULL
     WHERE driver_id = v_driver_id;

    DELETE FROM public.driver_locations WHERE driver_id = v_driver_id;
    DELETE FROM public.driver_bank_accounts WHERE driver_id = v_driver_id;
    DELETE FROM public.driver_occurrences WHERE driver_id = v_driver_id;
    DELETE FROM public.delivery_drivers WHERE id = v_driver_id OR user_id = p_user_id;
  END IF;

  DELETE FROM public.chat_messages WHERE sender_id = p_user_id;
  DELETE FROM public.profiles WHERE user_id = p_user_id OR id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'driver_id', v_driver_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_driver_account(UUID) TO authenticated, service_role;
