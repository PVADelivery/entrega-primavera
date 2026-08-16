import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { fetchCompanyNamesAdmin } from './companies.server';

export const getCompanyNames = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(data))
  .handler(async ({ data }) => {
    if (data.ids.length === 0) return [];
    return fetchCompanyNamesAdmin(data.ids);
  });
