import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../../../../_core/trpc";
import { MarcasService } from "../../application/services/marcas.service";
import { toTrpcError } from "../../../shared/utils/trpc-error";

const marcasService = new MarcasService();

export const marcasRouter = router({
  list: protectedProcedure.query(async () => {
    try {
      return await marcasService.list();
    } catch (error) {
      throw toTrpcError(error);
    }
  }),

  create: adminProcedure
    .input(z.object({ nome: z.string().min(1).max(100) }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.create(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  update: adminProcedure
    .input(z.object({ id: z.number(), nome: z.string().min(1).max(100) }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.update(input.id, { nome: input.nome });
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.delete(input.id);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
});
