import { describe, expect, it } from "vitest";
import {
  dedupeImportedSaleItems,
  dedupeItemLikeLines,
  validateKnownOrderLayout,
} from "./modules/vendas/application/services/pdf-sales-import.service";

describe("pdf sales import dedupe", () => {
  it("collapses duplicated item lines that only differ by spacing", () => {
    const lines = [
      "1,000 UN BOX BAU CASAL 138X188 SX  - 1.099,00 1.099,00",
      "1,000 UN BOX BAU CASAL 138X188 SX - 1.099,00 1.099,00",
    ];

    expect(dedupeItemLikeLines(lines)).toEqual([
      "1,000 UN BOX BAU CASAL 138X188 SX - 1.099,00 1.099,00",
    ]);
  });

  it("keeps distinct item lines when content actually differs", () => {
    const lines = [
      "1,000 UN BOX BAU CASAL 138X188 SX - 1.099,00 1.099,00",
      "1,000 UN BOX BAU QUEEN 158X198 SX - 1.299,00 1.299,00",
    ];

    expect(dedupeItemLikeLines(lines)).toHaveLength(2);
  });

  it("collapses duplicated parsed items and keeps the strongest match", () => {
    const items = [
      {
        productId: null,
        productName: "BOX BAU CASAL 138X188 SX -",
        medida: null,
        quantidade: 1,
        valorUnitario: 1099,
        valorTotal: 1099,
        confidence: 0.2,
        sourceLine: "1,000 UN BOX BAU CASAL 138X188 SX  - 1.099,00 1.099,00",
      },
      {
        productId: 77,
        productName: "BOX BAU CASAL 138X188 SX -",
        medida: "1.38x1.88",
        quantidade: 1,
        valorUnitario: 1099,
        valorTotal: 1099,
        confidence: 0.91,
        sourceLine: "1,000 UN BOX BAU CASAL 138X188 SX - 1.099,00 1.099,00",
      },
    ];

    expect(dedupeImportedSaleItems(items)).toEqual([
      {
        productId: 77,
        productName: "BOX BAU CASAL 138X188 SX -",
        medida: "1.38x1.88",
        quantidade: 1,
        valorUnitario: 1099,
        valorTotal: 1099,
        confidence: 0.91,
        sourceLine: "1,000 UN BOX BAU CASAL 138X188 SX - 1.099,00 1.099,00",
      },
    ]);
  });

  it("accepts the homologated order layout used by the standard PDF", () => {
    const text = `
      Pedido
      F.A.T.U.R.A
      Cliente: 4399 - LENIR COQUES DE CARVALHO
      Telefone: 94 99247-0136
      Vendedor: 10 - VANUZA P DE SOUZA
      Endereço: RUA 6
      Bairro: CENTRO
      Data: 30/03/2026
      Código Qtde Und Descrição dos Produtos Unitário Total
      Documento Descrição Forma
      047649 01/01 PIX 30/03/2026 5.880,00
      1,000 PC COLCHAO MOLA COMFY 30X188X138 - 2.890,00 2.890,00
      1,000 PC COL WISH I530 ENS ULTRASOFT A-30 138X188 - 2.500,00 2.500,00
      1,000 UN BOX CASAL 138X188 - 490,00 490,00
      Subtotal 5.880,00
      Desconto 0,00
      Total 5.880,00
    `;

    expect(
      validateKnownOrderLayout({
        text,
        documentNumber: "00007649",
        clienteExtraido: "4399 - LENIR COQUES DE CARVALHO",
        vendedorExtraido: "10 - VANUZA P DE SOUZA",
        enderecoExtraido: "RUA 6",
        formaPagamentoExtraida: "PIX",
        dataVendaExtraida: "2026-03-30T12:00:00.000Z",
        subtotal: 5880,
        desconto: 0,
        total: 5880,
        paymentEntriesCount: 1,
        itemLinesCount: 3,
      })
    ).toEqual([]);
  });

  it("flags PDFs that do not match the homologated order layout", () => {
    const text = `
      Relatório avulso
      Comprador final
      Item único promocional
      Total geral 250,00
    `;

    expect(
      validateKnownOrderLayout({
        text,
        documentNumber: null,
        clienteExtraido: null,
        vendedorExtraido: null,
        enderecoExtraido: null,
        formaPagamentoExtraida: null,
        dataVendaExtraida: null,
        subtotal: null,
        desconto: null,
        total: 250,
        paymentEntriesCount: 0,
        itemLinesCount: 0,
      })
    ).toContain("campo de cliente");
  });

  it("blocks tax invoice layouts that expose tributes instead of the commercial order pattern", () => {
    const text = `
      DANFE
      Chave de acesso: 1234 5678 9012 3456
      CFOP: 5102
      NCM: 9404.21.00
      Base de cálculo do ICMS: 1.000,00
      Valor do ICMS: 180,00
      IPI: 50,00
      PIS: 16,50
      COFINS: 76,00
      Total da nota: 1.000,00
    `;

    expect(
      validateKnownOrderLayout({
        text,
        documentNumber: "123456",
        clienteExtraido: "CLIENTE TESTE",
        vendedorExtraido: null,
        enderecoExtraido: null,
        formaPagamentoExtraida: null,
        dataVendaExtraida: null,
        subtotal: null,
        desconto: null,
        total: 1000,
        paymentEntriesCount: 0,
        itemLinesCount: 0,
      })
    ).toContain("aparência de nota fiscal tributária");
  });
});
