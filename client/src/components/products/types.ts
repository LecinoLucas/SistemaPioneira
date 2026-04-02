export type Product = {
  id: number;
  name: string;
  marca: string | null;
  medida: string;
  categoria: string;
  quantidade: number;
  estoqueMinimo: number;
  ativoParaVenda: boolean;
  arquivado: boolean;
  motivoInativacao: string | null;
  motivoArquivamento: string | null;
  statusProduto?: "ATIVO" | "INATIVO" | "ARQUIVADO";
};

export type ProductViewMode = "table" | "cards";

export type ProductFormData = {
  name: string;
  marca: string;
  medida: string;
  categoria: string;
  quantidade: number;
  estoqueMinimo: number;
};

export type DuplicateIdentityMatch = {
  id: number;
  name: string;
  marca: string | null;
  medida: string;
  categoria: string;
  quantidade: number;
  ativoParaVenda: boolean;
  arquivado: boolean;
};

function normalizeCatalogTypeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCatalogTypeInput(value: string) {
  return value.toLocaleUpperCase("pt-BR");
}

export function normalizeCatalogMeasureInput(value: string) {
  return value.toLocaleUpperCase("pt-BR");
}

export function normalizeCatalogBrandInput(value: string) {
  return value.toLocaleUpperCase("pt-BR");
}

export function normalizeCatalogModelInput(value: string) {
  return value.toLocaleUpperCase("pt-BR");
}

export function normalizeCatalogPaymentInput(value: string) {
  return value.toLocaleUpperCase("pt-BR");
}

export function normalizeCatalogSellerInput(value: string) {
  return value.toLocaleUpperCase("pt-BR");
}

export function resolveCatalogTypeValue(value: string, options: string[]) {
  const target = normalizeCatalogTypeKey(value);
  if (!target) return value;
  return options.find((option) => normalizeCatalogTypeKey(option) === target) ?? value;
}
