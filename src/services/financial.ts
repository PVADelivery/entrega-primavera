import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export async function getWallet(userId: string) {
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  
  if (!data) {
     const { data: newWallet, error: createError } = await supabase
       .from("wallets")
       .insert({ user_id: userId, balance: 0 })
       .select()
       .single();
     if (createError) throw createError;
     return newWallet;
  }
  
  return data;
}

export async function getTransactions(userId: string) {
  const { data, error } = await supabase
    .from("financial_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function requestWithdrawal(amount: number, _userId: string) {
  // Atomic, server-side balance check + deduction prevents race-condition overdraft
  const { error } = await (supabase as any).rpc("request_wallet_withdrawal", { _amount: amount });
  if (error) throw error;
  return { success: true };
}

export function useWallet() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wallet", user?.id],
    queryFn: () => (user?.id ? getWallet(user.id) : null),
    enabled: !!user?.id,
  });
}

export function useTransactions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: () => (user?.id ? getTransactions(user.id) : null),
    enabled: !!user?.id,
  });
}

export function useWithdrawals() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      return requestWithdrawal(amount, user.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
