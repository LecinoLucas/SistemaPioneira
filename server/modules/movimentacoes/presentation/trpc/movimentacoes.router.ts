import { z } from "zod";
import { protectedProcedure, router, withRateLimit } from "../../../../_core/trpc";
import { MovimentacoesService } from "../../application/services/movimentacoes.service";
import { toTrpcError } from "../../../shared/utils/trpc-error";

const movimentacoesService = new MovimentacoesService();

const paginationInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const movimentacoesRouter = router({
  list: protectedProcedure
    .use(withRateLimit({ scope: "movimentacoes.list", max: 120, windowMs: 60 * 1000 }))
    .input(paginationInput.optional())
    .query(async ({ input }) => {
      try {
        return await movimentacoesService.list(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  byProduct: protectedProcedure
    .use(withRateLimit({ scope: "movimentacoes.by_product", max: 120, windowMs: 60 * 1000 }))
    .input(
      z.object({
        productId: z.number(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      try {
        const { productId, ...pagination } = input;
        return await movimentacoesService.byProduct(productId, pagination);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
});
