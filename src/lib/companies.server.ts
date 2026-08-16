import { createClient } from '@supabase/supabase-js';

export async function fetchCompanyNamesAdmin(ids: string[]) {
  const url = process.env['EXTERNAL_SUPABASE_URL'] || 'https://owlbzwsdcognrgolvnzg.supabase.co';
  const key = process.env['EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'];
  if (!key) return [] as { id: string; name: string | null; phone: string | null }[];

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from('companies')
    .select('id, name, phone')
    .in('id', ids);

  if (error) {
    console.error('[companies.server] falha ao buscar lojas:', error.message);
    return [];
  }
  return (data ?? []) as { id: string; name: string | null; phone: string | null }[];
}
