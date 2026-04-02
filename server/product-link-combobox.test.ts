import { describe, expect, it } from "vitest";
import { buildProductLinkState } from "../client/src/components/sales/product-link-combobox.utils";

describe("ProductLinkCombobox search", () => {
  const products = [
    { id: 1, name: "COLCHAO ECOFLEX D33", medida: "1.38x1.88", marca: "ECOFLEX", quantidade: 4 },
    { id: 2, name: "TRAVESSEIRO SONO BOM", medida: "50x70", marca: "SONOBOM", quantidade: 8 },
    { id: 3, name: "CABECEIRA ROMA", medida: "1.60", marca: "LUXO", quantidade: 2 },
    { id: 4, name: "COLCHAO ANTIGO", medida: "0.88x1.88", marca: "RETIRADO", quantidade: 0 },
  ];

  it("shows a matching product when the user types its name", () => {
    const result = buildProductLinkState({
      products,
      value: null,
      search: "colchao",
    });

    expect(result.hasSuggestedMatches).toBe(true);
    expect(result.suggestedProducts.map((entry) => entry.product.id)).toContain(1);
    expect(result.suggestedProducts[0]?.product.id).toBe(1);
  });

  it("keeps the full in-stock list available when there is no direct suggestion", () => {
    const result = buildProductLinkState({
      products,
      value: null,
      search: "produto inexistente",
    });

    expect(result.hasSuggestedMatches).toBe(false);
    expect(result.fallbackProducts.map((entry) => entry.product.id)).toEqual([2, 1, 3]);
    expect(result.fallbackProducts.map((entry) => entry.product.id)).not.toContain(4);
  });

  it("uses the imported PDF text as a seed when the input is still empty", () => {
    const result = buildProductLinkState({
      products,
      value: null,
      search: "",
      searchSeed: "Colchão Ecoflex casal",
    });

    expect(result.effectiveQuery).not.toBe("");
    expect(result.hasSuggestedMatches).toBe(true);
    expect(result.suggestedProducts[0]?.product.id).toBe(1);
  });

  it("finds products by measure and brand when the user searches those fields", () => {
    const byMeasure = buildProductLinkState({
      products,
      value: null,
      search: "50x70",
    });
    const byBrand = buildProductLinkState({
      products,
      value: null,
      search: "luxo",
    });

    expect(byMeasure.suggestedProducts.map((entry) => entry.product.id)).toContain(2);
    expect(byBrand.suggestedProducts.map((entry) => entry.product.id)).toContain(3);
  });

  it("keeps the currently selected product available even when it has zero stock", () => {
    const result = buildProductLinkState({
      products,
      value: 4,
      search: "antigo",
    });

    expect(result.searchableProducts.map((entry) => entry.id)).toContain(4);
    expect(result.suggestedProducts.map((entry) => entry.product.id)).toContain(4);
  });

  it("marks products already used in other rows as unavailable for a new link", () => {
    const result = buildProductLinkState({
      products,
      value: null,
      search: "colchao",
      usedProductIds: new Set([1]),
    });

    const usedEntry = result.filtered.find((entry) => entry.product.id === 1);

    expect(usedEntry?.isUsed).toBe(true);
    expect(result.filtered[0]?.product.id).not.toBe(1);
  });
});
