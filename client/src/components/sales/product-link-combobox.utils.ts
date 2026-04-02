import type { MappingProduct } from "./SalesImportDialog";

export type RankedMappingProductEntry = {
  product: MappingProduct;
  score: number;
  isUsed: boolean;
  inStock: boolean;
};

type BuildProductLinkStateInput = {
  products: MappingProduct[];
  value: number | null;
  usedProductIds?: Set<number>;
  search?: string;
  searchSeed?: string;
};

export function normalizeProductLinkLookupValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreProductLinkMatch(product: MappingProduct, query: string): number {
  if (!query) return 0;

  const hay = normalizeProductLinkLookupValue(`${product.name} ${product.medida} ${product.marca ?? ""}`);
  if (!hay) return 0;
  if (hay.includes(query)) return 1;

  const queryTokens = query.split(" ").filter(Boolean);
  if (queryTokens.length === 0) return 0;

  const hayTokens = hay.split(" ").filter(Boolean);
  let hits = 0;
  let strongHits = 0;
  for (const token of queryTokens) {
    const hasMatch = hayTokens.some((hayToken) => hayToken.includes(token) || token.includes(hayToken));
    if (!hasMatch) continue;
    hits += 1;
    if (token.length >= 5) strongHits += 1;
  }

  const tokenScore = hits / queryTokens.length;
  return Math.min(0.95, tokenScore + (strongHits >= 2 ? 0.08 : 0));
}

export function buildProductLinkState({
  products,
  value,
  usedProductIds,
  search,
  searchSeed,
}: BuildProductLinkStateInput) {
  const normalizedSearch = normalizeProductLinkLookupValue(search ?? "");
  const normalizedSeed = normalizeProductLinkLookupValue(searchSeed ?? "");
  const effectiveQuery = normalizedSearch || normalizedSeed;
  const searchableProducts = products.filter((product) => product.quantidade > 0 || product.id === value);

  const filtered = searchableProducts
    .map((product) => {
      const score = scoreProductLinkMatch(product, effectiveQuery);
      const isUsed = usedProductIds?.has(product.id) && product.id !== value;
      const inStock = product.quantidade > 0;
      return { product, score, isUsed, inStock };
    })
    .sort((a, b) => {
      if (a.isUsed !== b.isUsed) return Number(a.isUsed) - Number(b.isUsed);
      if (effectiveQuery && a.score !== b.score) return b.score - a.score;
      if (a.inStock !== b.inStock) return Number(b.inStock) - Number(a.inStock);
      if (a.product.quantidade !== b.product.quantidade) return b.product.quantidade - a.product.quantidade;
      return `${a.product.name} ${a.product.medida}`.localeCompare(`${b.product.name} ${b.product.medida}`);
    });

  const hasSuggestedMatches = filtered.some((entry) => entry.score > 0);
  const suggestedProducts = filtered.filter((entry) => entry.score > 0).slice(0, 12);
  const fallbackProducts = filtered.filter((entry) => entry.score <= 0);

  return {
    normalizedSearch,
    normalizedSeed,
    effectiveQuery,
    searchableProducts,
    filtered,
    hasSuggestedMatches,
    suggestedProducts,
    fallbackProducts,
  };
}
