import "dotenv/config";
import { appRouter } from "../server/routers";
import * as db from "../server/db";

type StepResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

function createAdminCaller() {
  const user = {
    id: 1,
    openId: "smoke-admin",
    email: "admin@smoke.local",
    name: "Smoke Admin",
    loginMethod: "local",
    role: "admin" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return appRouter.createCaller({
    user,
    req: { protocol: "http", headers: {}, ip: "127.0.0.1" } as any,
    res: {} as any,
  } as any);
}

async function run() {
  const results: StepResult[] = [];
  const caller = createAdminCaller();
  const stamp = Date.now();

  const product = await db.createProduct({
    name: `SMOKE_IMPORT_${stamp}`,
    medida: "Solteiro",
    categoria: "Colchões",
    marca: "Test Brand",
    quantidade: 5,
    estoqueMinimo: 1,
    ativoParaVenda: true,
    arquivado: false,
  });

  const payload = {
    items: [{ productId: product.id, quantidade: 1 }],
    vendedor: "Cleonice",
    nomeCliente: "Cliente Smoke Import",
    telefoneCliente: "11999990000",
    enderecoCliente: "Rua Smoke, 123",
    formaPagamento: "PIX",
    dataVenda: new Date(),
    valorTotal: 999.9,
    observacoes: "Smoke import",
    tipoTransacao: "venda" as const,
    importMeta: {
      fileHash: `smoke-import-${stamp}`,
      fileName: `smoke-${stamp}.pdf`,
      documentNumber: `DOC-${stamp}`,
      total: 999.9,
      reviewNote: "approved on smoke",
    },
  };

  try {
    const first = await caller.vendas.registrarImportada(payload);
    results.push({
      name: "Register imported sale",
      ok: first?.success === true,
      detail: JSON.stringify(first),
    });
  } catch (error) {
    results.push({
      name: "Register imported sale",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await caller.vendas.registrarImportada(payload);
    results.push({
      name: "Block duplicate imported sale",
      ok: false,
      detail: "Expected duplicate protection, but second import was accepted.",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({
      name: "Block duplicate imported sale",
      ok: msg.toLowerCase().includes("já foi importado"),
      detail: msg,
    });
  }

  try {
    const history = await caller.vendas.importHistory({ page: 1, pageSize: 20, search: `smoke-${stamp}.pdf` });
    const found = history.items.some((item) => item.fileName === `smoke-${stamp}.pdf`);
    results.push({
      name: "Imported sale appears in history",
      ok: found,
      detail: `items=${history.items.length}`,
    });
  } catch (error) {
    results.push({
      name: "Imported sale appears in history",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  console.log("\n=== SMOKE SALES IMPORT FLOW ===");
  for (const item of results) {
    console.log(`${item.ok ? "PASS" : "FAIL"} | ${item.name}${item.detail ? ` | ${item.detail}` : ""}`);
  }
  console.log("===============================\n");

  const failed = results.some((item) => !item.ok);
  if (failed) process.exitCode = 1;
}

run().catch((error) => {
  console.error("[smoke-sales-import-flow] fatal", error);
  process.exit(1);
});

