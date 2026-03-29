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

  listMeasures: protectedProcedure.query(async () => {
    try {
      return await marcasService.listMeasures();
    } catch (error) {
      throw toTrpcError(error);
    }
  }),

  createMeasure: adminProcedure
    .input(z.object({ nome: z.string().min(1).max(100) }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.createMeasure(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  updateMeasure: adminProcedure
    .input(z.object({ id: z.number(), nome: z.string().min(1).max(100) }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.updateMeasure(input.id, { nome: input.nome });
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  deleteMeasure: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.deleteMeasure(input.id);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  listTypes: protectedProcedure.query(async () => {
    try {
      return await marcasService.listTypes();
    } catch (error) {
      throw toTrpcError(error);
    }
  }),

  createType: adminProcedure
    .input(z.object({ nome: z.string().min(1).max(100) }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.createType(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  updateType: adminProcedure
    .input(z.object({ id: z.number(), nome: z.string().min(1).max(100) }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.updateType(input.id, { nome: input.nome });
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  deleteType: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.deleteType(input.id);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  listModels: protectedProcedure.query(async () => {
    try {
      return await marcasService.listModels();
    } catch (error) {
      throw toTrpcError(error);
    }
  }),

  createModel: adminProcedure
    .input(
      z.object({
        nome: z.string().min(1).max(120),
        brandId: z.number().int().positive(),
        productTypeId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await marcasService.createModel(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  updateModel: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        nome: z.string().min(1).max(120),
        brandId: z.number().int().positive(),
        productTypeId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await marcasService.updateModel(input.id, {
          nome: input.nome,
          brandId: input.brandId,
          productTypeId: input.productTypeId,
        });
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  deleteModel: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.deleteModel(input.id);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  syncFromProducts: adminProcedure.mutation(async () => {
    try {
      return await marcasService.syncFromProducts();
    } catch (error) {
      throw toTrpcError(error);
    }
  }),

  listPaymentMethods: protectedProcedure.query(async () => {
    try {
      return await marcasService.listPaymentMethods();
    } catch (error) {
      throw toTrpcError(error);
    }
  }),

  createPaymentMethod: adminProcedure
    .input(
      z.object({
        codigo: z.string().min(1).max(80),
        nome: z.string().min(1).max(120),
        categoria: z.string().min(1).max(60),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await marcasService.createPaymentMethod(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  updatePaymentMethod: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        codigo: z.string().min(1).max(80),
        nome: z.string().min(1).max(120),
        categoria: z.string().min(1).max(60),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await marcasService.updatePaymentMethod(input.id, {
          codigo: input.codigo,
          nome: input.nome,
          categoria: input.categoria,
        });
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  deletePaymentMethod: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.deletePaymentMethod(input.id);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  listSellers: protectedProcedure.query(async () => {
    try {
      return await marcasService.listSellers();
    } catch (error) {
      throw toTrpcError(error);
    }
  }),

  createSeller: adminProcedure
    .input(z.object({ nome: z.string().min(1).max(120) }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.createSeller(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  updateSeller: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        nome: z.string().min(1).max(120),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await marcasService.updateSeller(input.id, { nome: input.nome });
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  deleteSeller: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await marcasService.deleteSeller(input.id);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
});
