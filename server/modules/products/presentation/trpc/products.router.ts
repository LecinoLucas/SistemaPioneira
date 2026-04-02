import { z } from "zod";
import {
  adminProcedure,
  managerOrAdminProcedure,
  protectedProcedure,
  router,
  withActionPermission,
  withRateLimit,
} from "../../../../_core/trpc";
import { FileAuditGateway } from "../../../audit/infrastructure/services/file-audit.gateway";
import { ProductsService } from "../../application/services/products.service";
import { toTrpcError } from "../../../shared/utils/trpc-error";

const productsService = new ProductsService(new FileAuditGateway());

const categorySchema = z.string().trim().min(1).max(60);
const productStatusSchema = z.enum(["ATIVO", "INATIVO", "ARQUIVADO"]);

export const productsRouter = router({
  list: protectedProcedure
    .use(withRateLimit({ scope: "products.list", max: 180, windowMs: 60 * 1000 }))
    .input(
      z
        .object({
          searchTerm: z.string().optional(),
          medida: z.string().optional(),
          categoria: z.string().optional(),
          marca: z.string().optional(),
          onlyActiveForSales: z.boolean().optional(),
          includeArchived: z.boolean().optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(25),
        })
        .optional()
    )
    .query(async ({ input }) => {
      try {
        return await productsService.list(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  getBrands: protectedProcedure.query(async () => {
    return await productsService.getBrands();
  }),

  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    try {
      return await productsService.getById(input.id);
    } catch (error) {
      throw toTrpcError(error);
    }
  }),

  checkDuplicateIdentity: managerOrAdminProcedure
    .use(withActionPermission("action:products.manage"))
    .input(
      z.object({
        name: z.string().min(1),
        medida: z.string().min(1),
        marca: z.string().optional(),
        excludeId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await productsService.checkDuplicateIdentity(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  create: managerOrAdminProcedure
    .use(withActionPermission("action:products.manage"))
    .input(
      z.object({
        name: z.string().min(1),
        marca: z.string().optional(),
        medida: z.string().min(1),
        categoria: categorySchema,
        quantidade: z.number().int().min(0),
        estoqueMinimo: z.number().int().min(0).default(3),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await productsService.create(
          {
            id: ctx.user.id,
            email: ctx.user.email,
            role: ctx.user.role,
            openId: ctx.user.openId,
            ip: ctx.req.ip,
          },
          input
        );
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  update: managerOrAdminProcedure
    .use(withActionPermission("action:products.manage"))
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        marca: z.string().optional(),
        medida: z.string().min(1).optional(),
        categoria: categorySchema.optional(),
        quantidade: z.number().int().min(0).optional(),
        estoqueMinimo: z.number().int().min(0).optional(),
        ativoParaVenda: z.boolean().optional(),
        arquivado: z.boolean().optional(),
        motivoInativacao: z.string().trim().max(500).nullable().optional(),
        motivoArquivamento: z.string().trim().max(500).nullable().optional(),
        statusProduto: productStatusSchema.optional(),
        auditJustification: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await productsService.update(
          {
            id: ctx.user.id,
            email: ctx.user.email,
            role: ctx.user.role,
            openId: ctx.user.openId,
            ip: ctx.req.ip,
          },
          input
        );
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  delete: managerOrAdminProcedure
    .use(withActionPermission("action:products.manage"))
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await productsService.delete(
          {
            id: ctx.user.id,
            email: ctx.user.email,
            role: ctx.user.role,
            openId: ctx.user.openId,
            ip: ctx.req.ip,
          },
          input.id
        );
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  deleteBatch: managerOrAdminProcedure
    .use(withActionPermission("action:products.manage"))
    .input(
      z.object({
        ids: z.array(z.number().int().positive()).min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await productsService.deleteBatch(
          {
            id: ctx.user.id,
            email: ctx.user.email,
            role: ctx.user.role,
            openId: ctx.user.openId,
            ip: ctx.req.ip,
          },
          input.ids
        );
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  lowStock: managerOrAdminProcedure.query(async () => {
    return await productsService.lowStock();
  }),

  negativeStock: managerOrAdminProcedure.query(async () => {
    return await productsService.negativeStock();
  }),

  updatePrice: adminProcedure
    .use(withActionPermission("action:products.pricing"))
    .input(
      z.object({
        id: z.number(),
        precoCusto: z.number().nullable(),
        precoVenda: z.number().nullable(),
        auditJustification: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await productsService.updatePriceWithJustification({
        actor: {
          id: ctx.user.id,
          email: ctx.user.email,
          role: ctx.user.role,
          openId: ctx.user.openId,
          ip: ctx.req.ip,
        },
        ...input,
      });
    }),

  archive: managerOrAdminProcedure
    .use(withActionPermission("action:products.manage"))
    .input(
      z.object({
        id: z.number(),
        motivoArquivamento: z.string().trim().min(3).max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await productsService.archive(
          {
            id: ctx.user.id,
            email: ctx.user.email,
            role: ctx.user.role,
            openId: ctx.user.openId,
            ip: ctx.req.ip,
          },
          input
        );
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  unarchive: managerOrAdminProcedure
    .use(withActionPermission("action:products.manage"))
    .input(
      z.object({
        id: z.number(),
        reativarParaVenda: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await productsService.unarchive(
          {
            id: ctx.user.id,
            email: ctx.user.email,
            role: ctx.user.role,
            openId: ctx.user.openId,
            ip: ctx.req.ip,
          },
          input
        );
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  priceHistory: adminProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }) => {
      return await productsService.priceHistory(input.productId);
    }),

  createBatch: managerOrAdminProcedure
    .use(withActionPermission("action:products.manage"))
    .input(
      z.object({
        name: z.string().min(1),
        marca: z.string().optional(),
        categoria: categorySchema,
        medidas: z.array(z.string().min(1)).min(1).max(30),
        quantidade: z.number().int().min(0),
        estoqueMinimo: z.number().int().min(0).default(3),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await productsService.createBatch(
          {
            id: ctx.user.id,
            email: ctx.user.email,
            role: ctx.user.role,
            openId: ctx.user.openId,
            ip: ctx.req.ip,
          },
          input
        );
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  exportPDF: adminProcedure
    .use(withActionPermission("action:products.pricing"))
    .use(withRateLimit({ scope: "products.export_pdf", max: 12, windowMs: 60 * 1000 }))
    .input(
      z.object({
        search: z.string().optional(),
        medida: z.string().optional(),
        categoria: z.string().optional(),
        marca: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await productsService.exportPdf(input);
    }),
});
