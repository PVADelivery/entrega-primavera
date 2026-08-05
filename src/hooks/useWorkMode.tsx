// @ts-nocheck
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type WorkMode = "delivery" | "ride";

export const SERVICE_LABELS: Record<string, string> = {
  delivery_moto: "Entregas de Lojas (Moto)",
  delivery_car: "Entregas de Lojas (Carro)",
  delivery_carro_aberto: "Frete (Carro Aberto)",
  taxi: "Transporte de Passageiros (Táxi)",
  mototaxi: "Transporte de Passageiros (Moto Táxi)",
};

export const DELIVERY_SERVICES = ["delivery_moto", "delivery_car", "delivery_carro_aberto", "moto", "carro", "carro_aberto"];
export const RIDE_SERVICES = ["taxi", "mototaxi"];

type WorkModeValue = {
  mode: WorkMode;
  setMode: (m: WorkMode) => void;
  serviceTypes: string[];
  canDelivery: boolean;
  canRide: boolean;
  loading: boolean;
};

const WorkModeContext = createContext<WorkModeValue | undefined>(undefined);

function storageKey(userId?: string | null) {
  return `workmode:${userId ?? "anon"}`;
}

export function WorkModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setModeState] = useState<WorkMode>("delivery");

  // Carrega as categorias liberadas pelo administrador
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setServiceTypes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("delivery_drivers")
        .select("service_types")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const list = Array.isArray((data as any)?.service_types) ? (data as any).service_types : [];
      setServiceTypes(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const canDelivery = serviceTypes.length === 0 || serviceTypes.some((s) => DELIVERY_SERVICES.includes(s));
  const canRide = serviceTypes.length === 0 || serviceTypes.some((s) => RIDE_SERVICES.includes(s));

  // Restaura preferência salva e corrige quando a categoria não é permitida
  useEffect(() => {
    if (loading) return;
    let saved: WorkMode | null = null;
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(storageKey(user?.id));
      if (raw === "delivery" || raw === "ride") saved = raw;
    }
    let next: WorkMode = saved ?? "delivery";
    if (next === "ride" && !canRide) next = "delivery";
    if (next === "delivery" && !canDelivery) next = canRide ? "ride" : "delivery";
    setModeState(next);
  }, [loading, canDelivery, canRide, user?.id]);

  const setMode = useCallback(
    (m: WorkMode) => {
      setModeState(m);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey(user?.id), m);
      }
    },
    [user?.id],
  );

  const value = useMemo(
    () => ({ mode, setMode, serviceTypes, canDelivery, canRide, loading }),
    [mode, setMode, serviceTypes, canDelivery, canRide, loading],
  );

  return <WorkModeContext.Provider value={value}>{children}</WorkModeContext.Provider>;
}

export function useWorkMode(): WorkModeValue {
  const ctx = useContext(WorkModeContext);
  if (!ctx) {
    return { mode: "delivery", setMode: () => {}, serviceTypes: [], canDelivery: true, canRide: true, loading: false };
  }
  return ctx;
}