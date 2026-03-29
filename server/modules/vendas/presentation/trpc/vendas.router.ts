import { z } from "zod";
import {
  managerOrAdminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  withActionPermission,
  withRateLimit,
} from "../../../../_core/trpc";
import { FileAuditGateway } from "../../../audit/infrastructure/services/file-audit.gateway";
import { VendasService } from "../../application/services/vendas.service";

const vendasService = new VendasService(new FileAuditGateway());

const tipoTransacaoSchema = z.enum(["venda", "troca", "brinde", "emprestimo", "permuta"]);

export const vendasRouter = router({
  importHistory: protectedProcedure
    .use(withActionPermission("action:sales.manage"))
    .input(
      z
        .object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(20),
          search: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      return await vendasService.importHistory(input);
    }),

  importFromFolder: protectedProcedure
    .use(withActionPermission("action:sales.manage"))
    .use(withRateLimit({ scope: "vendas.import_from_folder", max: 10, windowMs: 60 * 1000 }))
    .input(
      z.object({
        folderPath: z.string().min(1).optional(),
        maxFiles: z.number().int().min(1).max(100).default(30),
      })
    )
    .mutation(async ({ input }) => {
      return await vendasService.importFromFolder(input);
    }),

  importFromUploadedFiles: protectedProcedure
    .use(withActionPermission("action:sales.manage"))
    .use(withRateLimit({ scope: "vendas.import_uploaded_files", max: 10, windowMs: 60 * 1000 }))
    .input(
      z.object({
        files: z
          .array(
            z.object({
              fileName: z.string().min(1),
              fileBase64: z.string().min(20).max(16_000_000),
            })
          )
          .min(1)
          .max(20),
      })
    )
    .mutation(async ({ input }) => {
      return await vendasService.importFromUploadedFiles(input);
    }),

  registerPublic: publicProcedure
    .use(withRateLimit({ scope: "vendas.register_public", by: "ip", max: 30, windowMs: 60 * 1000 }))
    .input(
      z.object({
        items: z
          .array(
            z.object({
              productId: z.number(),
              quantidade: z.number().int().min(1),
            })
          )
          .min(1, "Adicione ao menos um item na venda."),
        nomeCliente: z.string().optional(),
        telefoneCliente: z.string().optional(),
        enderecoCliente: z.string().optional(),
        formaPagamento: z.string().trim().min(1, "Forma de pagamento é obrigatória."),
        valorTotal: z.number().optional(),
        observacoes: z.string().optional(),
        tipoTransacao: tipoTransacaoSchema.default("venda"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await vendasService.registerPublic(input, ctx.req.ip);
    }),

  registrar: protectedProcedure
    .use(withActionPermission("action:sales.manage"))
    .use(withRateLimit({ scope: "vendas.registrar", max: 60, windowMs: 60 * 1000 }))
    .input(
      z.object({
        items: z
          .array(
            z.object({
              productId: z.number(),
              quantidade: z.number().int().min(1),
            })
          )
          .min(1, "Adicione ao menos um item na venda."),
        vendedor: z.string().optional(),
        nomeCliente: z.string().optional(),
        telefoneCliente: z.string().optional(),
        enderecoCliente: z.string().optional(),
        formaPagamento: z.string().trim().min(1, "Forma de pagamento é obrigatória."),
        valorTotal: z.number().optional(),
        dataVenda: z.date().optional(),
        observacoes: z.string().optional(),
        tipoTransacao: tipoTransacaoSchema.default("venda"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await vendasService.registrar(
        {
          id: ctx.user.id,
          email: ctx.user.email,
          role: ctx.user.role,
          openId: ctx.user.openId,
          ip: ctx.req.ip,
        },
        input
      );
    }),

  registrarImportada: protectedProcedure
    .use(withActionPermission("action:sales.manage"))
    .use(withRateLimit({ scope: "vendas.registrar_importada", max: 60, windowMs: 60 * 1000 }))
    .input(
      z.object({
        items: z
          .array(
            z.object({
              productId: z.number(),
              quantidade: z.number().int().min(1),
            })
          )
          .min(1, "Adicione ao menos um item na venda."),
        vendedor: z.string().optional(),
        nomeCliente: z.string().optional(),
        telefoneCliente: z.string().optional(),
        enderecoCliente: z.string().optional(),
        formaPagamento: z.string().trim().min(1, "Forma de pagamento é obrigatória."),
        dataVenda: z.date().optional(),
        valorTotal: z.number().optional(),
        observacoes: z.string().optional(),
        tipoTransacao: tipoTransacaoSchema.default("venda"),
        importMeta: z.object({
          fileHash: z.string().min(16),
          fileName: z.string().min(1),
          documentNumber: z.string().optional().nullable(),
          total: z.number().optional().nullable(),
          reviewNote: z.string().max(1000).optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await vendasService.registrarImportada(
        {
          id: ctx.user.id,
          email: ctx.user.email,
          role: ctx.user.role,
          openId: ctx.user.openId,
          ip: ctx.req.ip,
        },
        input
      );
    }),

  getByDateRange: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ input }) => {
      return await vendasService.getByDateRange(input);
    }),

  list: protectedProcedure
    .use(withRateLimit({ scope: "vendas.list", max: 120, windowMs: 60 * 1000 }))
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        tipoTransacao: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return await vendasService.list(input);
    }),

  cancelar: managerOrAdminProcedure
    .use(withActionPermission("action:sales.manage"))
    .input(
      z.object({
        vendaId: z.number(),
        motivo: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await vendasService.cancelar(
        {
          id: ctx.user.id,
          email: ctx.user.email,
          role: ctx.user.role,
          openId: ctx.user.openId,
          ip: ctx.req.ip,
        },
        input
      );
    }),

  editar: managerOrAdminProcedure
    .use(withActionPermission("action:sales.manage"))
    .input(
      z.object({
        vendaId: z.number(),
        vendedor: z.string().optional(),
        observacoes: z.string().optional(),
        quantidade: z.number().int().min(1).optional(),
        tipoTransacao: tipoTransacaoSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await vendasService.editar(
        {
          id: ctx.user.id,
          email: ctx.user.email,
          role: ctx.user.role,
          openId: ctx.user.openId,
          ip: ctx.req.ip,
        },
        input
      );
    }),

  byVendedor: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ input }) => {
      return await vendasService.byVendedor(input);
    }),

  relatorio: protectedProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        vendedor: z.string().optional(),
        nomeCliente: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return await vendasService.relatorio(input);
    }),

  exportarRelatorioPdf: protectedProcedure
    .use(withRateLimit({ scope: "vendas.export_relatorio_pdf", max: 10, windowMs: 60 * 1000 }))
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        vendedor: z.string().optional(),
        nomeCliente: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await vendasService.exportarRelatorioPdf(input);
    }),

  exportarRelatorioExcel: protectedProcedure
    .use(withRateLimit({ scope: "vendas.export_relatorio_excel", max: 10, windowMs: 60 * 1000 }))
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        vendedor: z.string().optional(),
        nomeCliente: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await vendasService.exportarRelatorioExcel(input);
    }),

  relatorioEncomendas: protectedProcedure
    .input(
      z.object({
        nomeCliente: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return await vendasService.relatorioEncomendas(input);
    }),

  exportarEncomendasPdf: protectedProcedure
    .use(withRateLimit({ scope: "vendas.export_encomendas_pdf", max: 10, windowMs: 60 * 1000 }))
    .input(
      z.object({
        nomeCliente: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await vendasService.exportarEncomendasPdf(input);
    }),

  exportarEncomendasExcel: protectedProcedure
    .use(withRateLimit({ scope: "vendas.export_encomendas_excel", max: 10, windowMs: 60 * 1000 }))
    .input(
      z.object({
        nomeCliente: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await vendasService.exportarEncomendasExcel(input);
    }),

  excluir: managerOrAdminProcedure
    .use(withActionPermission("action:sales.manage"))
    .input(
      z.object({
        vendaId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await vendasService.excluir(
        {
          id: ctx.user.id,
          email: ctx.user.email,
          role: ctx.user.role,
          openId: ctx.user.openId,
          ip: ctx.req.ip,
        },
        input
      );
    }),

  rankingVendedores: protectedProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      return await vendasService.rankingVendedores(input);
    }),

  rankingProdutos: protectedProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      return await vendasService.rankingProdutos(input);
    }),
});
