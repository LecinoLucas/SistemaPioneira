import { TRPCError } from "@trpc/server";
import * as db from "../../../../db";
import { DomainError } from "../../../shared/errors/domain-error";

export class EncomendasService {
  async create(
    userId: number,
    input: {
      productId?: number;
      nomeProduto?: string;
      medidaProduto?: string;
      quantidade: number;
      nomeCliente: string;
      telefoneCliente?: string;
      dataCompra?: Date;
      prazoEntregaDias?: number;
      dataEntrega?: Date;
      observacoes?: string;
      vendedor?: string;
    }
  ) {
    if (!input.productId && (!input.nomeProduto || !input.medidaProduto)) {
      throw new DomainError(
        "Deve fornecer productId ou produto personalizado (nome e medida).",
        "BAD_REQUEST"
      );
    }
    return await db.createEncomenda({ ...input, userId });
  }

  async list(input?: { status?: string; cliente?: string }) {
    return await db.getEncomendas(input?.status, input?.cliente);
  }

  async update(
    id: number,
    input: {
      status?: "pendente" | "em_producao" | "pronto" | "entregue" | "cancelado";
      dataEntrega?: Date;
      observacoes?: string;
      pedidoFeito?: boolean;
    }
  ) {
    return await db.updateEncomenda(id, input);
  }

  async delete(id: number) {
    return await db.deleteEncomenda(id);
  }

  async exportPdf(input: { status?: string; cliente?: string }) {
    const { generateEncomendasPDF } = await import("../../../../pdfExportEncomendas");
    const encomendas = await db.getEncomendas(input.status, input.cliente);
    return await generateEncomendasPDF(encomendas);
  }
}
