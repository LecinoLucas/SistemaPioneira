import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { authRouter } from "./routers/authRouter";
import { catalogoRouter } from "./routers/catalogoRouter";
import { dashboardRouter } from "./routers/dashboardRouter";
import { encomendasRouter } from "./routers/encomendasRouter";
import { exportRouter } from "./routers/exportRouter";
import { marcasRouter } from "./routers/marcasRouter";
import { movimentacoesRouter } from "./routers/movimentacoesRouter";
import { productsRouter } from "./routers/productsRouter";
import { vendasRouter } from "./routers/vendasRouter";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  products: productsRouter,
  vendas: vendasRouter,
  dashboard: dashboardRouter,
  encomendas: encomendasRouter,
  catalogo: catalogoRouter,
  ...(ENV.legacyMarcasRouterEnabled ? { marcas: marcasRouter } : {}),
  movimentacoes: movimentacoesRouter,
  export: exportRouter,
});

export type AppRouter = typeof appRouter;
