import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describeDb("vendas.registrar - negative stock", () => {
  it("should allow selling products with zero stock (encomendas)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create a test product with zero stock directly in DB
    const product = await db.createProduct({
      name: "Test Product Zero Stock",
      medida: "Solteiro",
      quantidade: 0,
      categoria: "Colchões",
      marca: "Test Brand",
      estoqueMinimo: 1,
      ativoParaVenda: true,
      arquivado: false,
    });

    // Attempt to sell the product with zero stock
    const result = await caller.vendas.registrar({
      items: [
        {
          productId: product.id,
          quantidade: 2,
        },
      ],
      vendedor: "Cleonice",
      formaPagamento: "PIX",
      observacoes: "Encomenda - Cliente João",
    });

    expect(result).toEqual({ success: true });

    // Verify product stock is now negative
    const updatedProduct = await db.getProductById(product.id);
    expect(updatedProduct?.quantidade).toBe(-2);
  });

  it("should allow selling more than available stock", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create a test product with limited stock
    const product = await db.createProduct({
      name: "Test Product Limited Stock",
      medida: "Queen",
      quantidade: 3,
      categoria: "Colchões",
      marca: "Test Brand",
      estoqueMinimo: 1,
      ativoParaVenda: true,
      arquivado: false,
    });

    // Attempt to sell more than available
    const result = await caller.vendas.registrar({
      items: [
        {
          productId: product.id,
          quantidade: 5,
        },
      ],
      vendedor: "Luciano",
      formaPagamento: "PIX",
      observacoes: "Encomenda parcial",
    });

    expect(result).toEqual({ success: true });

    // Verify product stock is now negative
    const updatedProduct = await db.getProductById(product.id);
    expect(updatedProduct?.quantidade).toBe(-2);
  });
});

describeDb("vendas.editar - negative stock", () => {
  it("should allow editing sale quantity to create negative stock", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create a test product with some stock
    const product = await db.createProduct({
      name: "Test Product Edit",
      medida: "Casal",
      quantidade: 2,
      categoria: "Colchões",
      marca: "Test Brand",
      estoqueMinimo: 1,
      ativoParaVenda: true,
      arquivado: false,
    });

    // Register a sale
    await caller.vendas.registrar({
      items: [
        {
          productId: product.id,
          quantidade: 1,
        },
      ],
      vendedor: "Vanuza",
      formaPagamento: "PIX",
      observacoes: "Venda inicial",
    });

    // Get the sale
    const sales = await caller.vendas.list({ page: 1, limit: 10 });
    const sale = sales.vendas.find(v => v.productId === product.id);
    expect(sale).toBeDefined();

    // Edit the sale to increase quantity beyond available stock
    const result = await caller.vendas.editar({
      vendaId: sale!.id,
      quantidade: 5,
      observacoes: "Aumentada para encomenda",
    });

    expect(result).toEqual({ success: true });

    // Verify product stock is now negative
    const updatedProduct = await db.getProductById(product.id);
    expect(updatedProduct?.quantidade).toBe(-3); // 2 - 5 = -3
  });

  it("should update vendedor, observacoes and quantidade", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create a test product
    const product = await db.createProduct({
      name: "Test Product Edit All Fields",
      medida: "King",
      quantidade: 10,
      categoria: "Colchões",
      marca: "Test Brand",
      estoqueMinimo: 1,
      ativoParaVenda: true,
      arquivado: false,
    });

    // Register a sale
    await caller.vendas.registrar({
      items: [
        {
          productId: product.id,
          quantidade: 2,
        },
      ],
      vendedor: "Cleonice",
      formaPagamento: "PIX",
      observacoes: "Observação inicial",
    });

    // Get the sale
    const sales = await caller.vendas.list({ page: 1, limit: 10 });
    const sale = sales.vendas.find(v => v.productId === product.id);
    expect(sale).toBeDefined();

    // Edit all fields including quantity
    const result = await caller.vendas.editar({
      vendaId: sale!.id,
      vendedor: "Thuanny",
      observacoes: "Observação atualizada - Cliente Maria",
      quantidade: 3, // Changed from 2 to 3
    });

    expect(result).toEqual({ success: true });

    // Verify product stock was adjusted (10 - 3 instead of 10 - 2)
    const updatedProduct = await db.getProductById(product.id);
    expect(updatedProduct?.quantidade).toBe(7); // 10 - 3 = 7
  });
});

describeDb("dashboard.negativeStock", () => {
  it("should return products with negative stock (encomendas)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create a test product and sell it to create negative stock
    const product = await db.createProduct({
      name: "Test Product Negative",
      medida: "Solteirão",
      quantidade: 0,
      categoria: "Colchões",
      marca: "Test Brand",
      estoqueMinimo: 1,
      ativoParaVenda: true,
      arquivado: false,
    });

    await caller.vendas.registrar({
      items: [
        {
          productId: product.id,
          quantidade: 3,
        },
      ],
      vendedor: "Cleonice",
      formaPagamento: "PIX",
      observacoes: "Encomenda urgente",
    });

    // Get negative stock products
    const negativeStockProducts = await caller.products.negativeStock();

    // Verify the product appears in the list
    const foundProduct = negativeStockProducts.find(p => p.id === product.id);
    expect(foundProduct).toBeDefined();
    expect(foundProduct?.quantidade).toBe(-3);
  });
});

describeDb("vendas.catalog-governance", () => {
  it("should reject sale with empty items list", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.vendas.registrar({
        items: [],
        vendedor: "Cleonice",
        formaPagamento: "PIX",
        observacoes: "Sem itens",
        tipoTransacao: "venda",
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining("ao menos um item"),
    });
  });

  it("should reject sale without payment method", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const product = await db.createProduct({
      name: "Test Product Payment Required",
      medida: "Casal",
      quantidade: 1,
      categoria: "Colchões",
      marca: "Test Brand",
      estoqueMinimo: 1,
      ativoParaVenda: true,
      arquivado: false,
    });

    await expect(
      caller.vendas.registrar({
        items: [{ productId: product.id, quantidade: 1 }],
        vendedor: "Cleonice",
        formaPagamento: "",
        observacoes: "Sem forma de pagamento",
      })
    ).rejects.toThrow(/forma de pagamento/i);
  });

  it("should reject sale with unknown payment method", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const product = await db.createProduct({
      name: "Test Product Unknown Payment",
      medida: "Queen",
      quantidade: 1,
      categoria: "Colchões",
      marca: "Test Brand",
      estoqueMinimo: 1,
      ativoParaVenda: true,
      arquivado: false,
    });

    await expect(
      caller.vendas.registrar({
        items: [{ productId: product.id, quantidade: 1 }],
        vendedor: "Cleonice",
        formaPagamento: "PAGAMENTO_INVALIDO",
        observacoes: "Forma inválida",
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining("não está cadastrada no catálogo"),
    });
  });

  it("should reject sale with unknown seller", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const product = await db.createProduct({
      name: "Test Product Unknown Seller",
      medida: "King",
      quantidade: 1,
      categoria: "Colchões",
      marca: "Test Brand",
      estoqueMinimo: 1,
      ativoParaVenda: true,
      arquivado: false,
    });

    await expect(
      caller.vendas.registrar({
        items: [{ productId: product.id, quantidade: 1 }],
        vendedor: "VENDEDOR_FANTASMA",
        formaPagamento: "PIX",
        observacoes: "Vendedor inválido",
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining("não está cadastrado no catálogo"),
    });
  });
});
