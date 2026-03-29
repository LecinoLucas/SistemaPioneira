import "dotenv/config";
import { appRouter } from "../server/routers";
import * as db from "../server/db";

type StepResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

type AuthUser = {
  id: number;
  openId: string;
  email: string;
  name: string;
  loginMethod: string;
  role: "admin";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

function createAdminCaller() {
  const user: AuthUser = {
    id: 1,
    openId: "smoke-admin",
    email: "admin@smoke.local",
    name: "Smoke Admin",
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx = {
    user,
    req: {
      protocol: "http",
      headers: {},
      ip: "127.0.0.1",
    } as any,
    res: {} as any,
  };

  return appRouter.createCaller(ctx as any);
}

async function run() {
  const results: StepResult[] = [];
  const caller = createAdminCaller();
  const stamp = Date.now();

  const product = await db.createProduct({
    name: `SMOKE_SALES_${stamp}`,
    medida: "Solteiro",
    categoria: "Colchões",
    marca: "Test Brand",
    quantidade: 5,
    estoqueMinimo: 1,
    ativoParaVenda: true,
    arquivado: false,
  });

  const saleBaseInput = {
    items: [{ productId: product.id, quantidade: 1 }],
    observacoes: "Smoke sales flow",
    tipoTransacao: "venda" as const,
  };

  try {
    await caller.vendas.registrar({
      ...saleBaseInput,
      vendedor: "Cleonice",
    });
    results.push({
      name: "Reject missing payment method",
      ok: false,
      detail: "Expected validation error, but sale was accepted.",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({
      name: "Reject missing payment method",
      ok: msg.toLowerCase().includes("forma de pagamento"),
      detail: msg,
    });
  }

  try {
    await caller.vendas.registrar({
      ...saleBaseInput,
      vendedor: "VENDEDOR_INEXISTENTE",
      formaPagamento: "PIX",
    });
    results.push({
      name: "Reject unknown seller",
      ok: false,
      detail: "Expected validation error, but sale was accepted.",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({
      name: "Reject unknown seller",
      ok: msg.toLowerCase().includes("não está cadastrado"),
      detail: msg,
    });
  }

  try {
    const registered = await caller.vendas.registrar({
      ...saleBaseInput,
      vendedor: "Cleonice",
      formaPagamento: "PIX",
    });
    results.push({
      name: "Register valid sale",
      ok: registered?.success === true,
      detail: JSON.stringify(registered),
    });
  } catch (error) {
    results.push({
      name: "Register valid sale",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const list = await caller.vendas.list({ page: 1, limit: 50 });
  const createdSale = list.vendas.find((v) => v.productId === product.id);
  results.push({
    name: "Sale listed after creation",
    ok: Boolean(createdSale),
    detail: createdSale ? `saleId=${createdSale.id}` : "Sale not found in first page list.",
  });

  if (createdSale) {
    try {
      const edited = await caller.vendas.editar({
        vendaId: createdSale.id,
        quantidade: 2,
        vendedor: "Luciano",
        observacoes: "Smoke edited",
      });
      results.push({
        name: "Edit sale (quantity + seller)",
        ok: edited?.success === true,
        detail: JSON.stringify(edited),
      });
    } catch (error) {
      results.push({
        name: "Edit sale (quantity + seller)",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failed = results.filter((item) => !item.ok);
  console.log("\n=== SMOKE SALES FLOW ===");
  for (const item of results) {
    console.log(`${item.ok ? "PASS" : "FAIL"} | ${item.name}${item.detail ? ` | ${item.detail}` : ""}`);
  }
  console.log("========================\n");

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("[smoke-sales-flow] fatal", error);
  process.exit(1);
});
