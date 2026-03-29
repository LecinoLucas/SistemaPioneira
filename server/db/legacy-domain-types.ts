import { encomendas, products, vendas } from "../../drizzle/schema";

export const PRODUCT_CATEGORIES = [
  "Colchões",
  "Roupas de Cama",
  "Pillow Top",
  "Travesseiros",
  "Cabeceiras",
  "Box Baú",
  "Box Premium",
  "Box Tradicional",
  "Acessórios",
  "Bicamas",
  "Camas",
] as const satisfies readonly NonNullable<typeof products.$inferSelect["categoria"]>[];

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const VENDA_TIPOS_TRANSACAO = [
  "venda",
  "troca",
  "brinde",
  "emprestimo",
  "permuta",
] as const satisfies readonly NonNullable<typeof vendas.$inferSelect["tipoTransacao"]>[];

export type VendaTipoTransacao = (typeof VENDA_TIPOS_TRANSACAO)[number];

export const ENCOMENDA_STATUS = [
  "pendente",
  "em_producao",
  "pronto",
  "entregue",
  "cancelado",
] as const satisfies readonly NonNullable<typeof encomendas.$inferSelect["status"]>[];

export type EncomendaStatus = (typeof ENCOMENDA_STATUS)[number];

export function isProductCategory(value: string): value is ProductCategory {
  return PRODUCT_CATEGORIES.includes(value as ProductCategory);
}

export function isVendaTipoTransacao(value: string): value is VendaTipoTransacao {
  return VENDA_TIPOS_TRANSACAO.includes(value as VendaTipoTransacao);
}

export function isEncomendaStatus(value: string): value is EncomendaStatus {
  return ENCOMENDA_STATUS.includes(value as EncomendaStatus);
}
