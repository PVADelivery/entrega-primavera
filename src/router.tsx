import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 1000 * 60 * 5, // 5 minutos sem recarregar à toa
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: false,
    defaultPreloadStaleTime: 0,
  });

  const originalPreload = router.preloadRoute.bind(router);
  router.preloadRoute = async (opts: any) => {
    try {
      return await originalPreload(opts);
    } catch {
      return undefined;
    }
  };

  return router;
};
