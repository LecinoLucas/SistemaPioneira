import * as db from "../../../../db";

export class MovimentacoesService {
  async list(input?: { page?: number; pageSize?: number }) {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.min(input?.pageSize ?? 50, 200);
    return await db.getAllMovimentacoes(pageSize, (page - 1) * pageSize);
  }

  async byProduct(productId: number, input?: { page?: number; pageSize?: number }) {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.min(input?.pageSize ?? 50, 200);
    return await db.getMovimentacoesByProduct(productId, pageSize, (page - 1) * pageSize);
  }
}
