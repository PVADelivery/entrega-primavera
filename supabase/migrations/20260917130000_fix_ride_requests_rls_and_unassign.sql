-- ==============================================================================
-- PROJETO SUPABASE OFICIAL: owlbzwsdcognrgolvnzg (MT 24 Horas Express / Primavera)
-- CORREÇÃO DEFINITIVA DE RLS E RPC PARA DEVOLVER CORRIDAS (ride_requests)
-- ==============================================================================

-- 1. Remove políticas restritivas que impediam motoristas de devolver a corrida (driver_id = NULL)
DROP POLICY IF EXISTS "ride_requests_update_scoped" ON public.ride_requests;
DROP POLICY IF EXISTS "ride_requests_update_all" ON public.ride_requests;

-- 2. Permite UPDATE para todos os usuários autenticados (mesmo padrão consolidado em deliveries_update_all)
CREATE POLICY "ride_requests_update_all" ON public.ride_requests
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Cria a RPC unassign_ride_driver com SECURITY DEFINER para garantir bypass de RLS e devolução atômica
CREATE OR REPLACE FUNCTION public.unassign_ride_driver(p_ride_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ride_requests
  SET 
    driver_id = NULL,
    status = 'pending',
    updated_at = NOW()
  WHERE id = p_ride_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Corrida devolvida com sucesso para a fila de disponíveis.'
  );
END;
$$;

-- 4. Concessão de permissões de execução para todas as roles da plataforma
GRANT EXECUTE ON FUNCTION public.unassign_ride_driver(UUID) TO authenticated, anon, service_role, public;
GRANT ALL ON public.ride_requests TO authenticated, anon, service_role, public;
