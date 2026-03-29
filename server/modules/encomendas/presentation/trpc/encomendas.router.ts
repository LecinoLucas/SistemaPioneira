import { z } from "zod";
import { adminProcedure, protectedProcedure, router, withActionPermission, withRateLimit } from "../../../../_core/trpc";
import { EncomendasService } from "../../application/services/encomendas.service";
import { toTrpcError } from "../../../shared/utils/trpc-error";

const encomendasService = new EncomendasService();

const encomendaStatusSchema = z.enum(["pendente", "em_producao", "pronto", "entregue", "cancelado"]);

export const encomendasRouter = router({
  create: protectedProcedure
    .use(withActionPermission("action:orders.manage"))
    .use(withRateLimit({ scope: "encomendas.create", max: 60, windowMs: 60 * 1000 }))
    .input(
      z.object({
        productId: z.number().optional(),
        nomeProduto: z.string().optional(),
        medidaProduto: z.string().optional(),
        quantidade: z.number().min(1),
        nomeCliente: z.string().min(1),
        telefoneCliente: z.string().optional(),
        dataCompra: z.date().optional(),
        prazoEntregaDias: z.number().int().min(1).optional(),
        dataEntrega: z.date().optional(),
        observacoes: z.string().optional(),
        vendedor: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await encomendasService.create(ctx.user.id, input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          status: encomendaStatusSchema.or(z.literal("todos")).optional(),
          cliente: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      try {
        return await encomendasService.list(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  update: protectedProcedure
    .use(withActionPermission("action:orders.manage"))
    .input(
      z.object({
        id: z.number(),
        status: encomendaStatusSchema.optional(),
        dataEntrega: z.date().optional(),
        observacoes: z.string().optional(),
        pedidoFeito: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { id, ...updates } = input;
        return await encomendasService.update(id, updates);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  delete: adminProcedure
    .use(withActionPermission("action:orders.manage"))
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        return await encomendasService.delete(input.id);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  exportPdf: protectedProcedure
    .use(withRateLimit({ scope: "encomendas.export_pdf", max: 10, windowMs: 60 * 1000 }))
    .input(z.object({ status: z.string().optional(), cliente: z.string().optional() }))
    .mutation(async ({ input }) => {
      try {
        return await encomendasService.exportPdf(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
});
