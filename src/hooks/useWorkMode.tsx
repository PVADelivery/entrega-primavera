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
      try {
        let data: any = null;
        const { data: d1 } = await supabase
          .from("delivery_drivers")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (d1) {
          data = d1;
        } else {
          const { data: d2 } = await supabase
            .from("delivery_drivers")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();
          data = d2;
        }

        if (cancelled) return;

        let list: string[] = [];
        if (data) {
          if (Array.isArray((data as any)?.service_types)) {
            list = (data as any).service_types;
          } else if (typeof (data as any)?.service_types === "string") {
            try {
              list = JSON.parse((data as any).service_types);
            } catch (e) {
              list = [(data as any).service_types];
            }
          }
        }

        setServiceTypes(list);
      } catch (err) {
        console.warn("Aviso ao carregar permissões do motorista:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Se não houver restrição explícita ou se houver categorias cadastradas, libera de forma resiliente
  const RIDE_KEYS = ["taxi", "mototaxi", "moto_taxi", "táxi", "passageiros", "passageiro", "passenger", "ride", "corridas", "car", "motorcycle", "carro", "moto"];
  const DELIVERY_KEYS = ["delivery", "entrega", "entregas", "moto", "carro", "frete", "carro_aberto", "loja", "lojas"];

  const canDelivery = useMemo(() => {
    if (!serviceTypes || serviceTypes.length === 0) return true;
    return serviceTypes.some((s) => DELIVERY_KEYS.some((k) => String(s).toLowerCase().includes(k)));
  }, [serviceTypes]);

  const canRide = useMemo(() => {
    if (!serviceTypes || serviceTypes.length === 0) return true;
    return serviceTypes.some((s) => RIDE_KEYS.some((k) => String(s).toLowerCase().includes(k)));
  }, [serviceTypes]);

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