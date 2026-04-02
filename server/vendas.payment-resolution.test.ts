import { describe, expect, it } from "vitest";
import {
  resolveDefaultPaymentMethod,
  resolveDefaultSellerName,
  splitCombinedPaymentMethods,
} from "./modules/vendas/application/services/vendas.service";

describe("vendas payment and seller fallback resolution", () => {
  it("splits combined payment methods from imported sales", () => {
    expect(splitCombinedPaymentMethods("PIX + RECEBER NA ENTREGA")).toEqual([
      "PIX",
      "RECEBER NA ENTREGA",
    ]);
  });

  it("resolves default payment methods even when they come combined from the UI", () => {
    expect(resolveDefaultPaymentMethod("PIX")).toBe("PIX");
    expect(resolveDefaultPaymentMethod("receber na entrega")).toBe("RECEBER NA ENTREGA");
    expect(resolveDefaultPaymentMethod("cartao de credito")).toBe("CARTÃO DE CRÉDITO");
  });

  it("resolves default seller names using normalized imported labels", () => {
    expect(resolveDefaultSellerName("Vanuza")).toBe("Vanuza");
    expect(resolveDefaultSellerName("10 - VANUZA P DE SOUZA")).toBe("Vanuza");
  });
});
