import "dotenv/config";
import { test, expect } from "@playwright/test";
import mysql from "mysql2/promise";

async function loginAsLocalAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@pioneira.local");
  await page.getByLabel("Senha").fill("admin123");
  await page.getByRole("button", { name: "Entrar no Sistema" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
}

async function seedImportSearchProduct() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Banco de dados indisponível para o teste E2E.");
  }
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const uniqueSuffix = Date.now();
    const productName = `COLCHAO E2E PLAYWRIGHT ${uniqueSuffix}`;
    const [result] = await connection.execute<mysql.ResultSetHeader>(
      `
        INSERT INTO products (
          name,
          marca,
          medida,
          categoria,
          quantidade,
          estoqueMinimo,
          ativoParaVenda,
          arquivado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [productName, "E2E", "1.38x1.88", "Colchões", 7, 1, 1, 0],
    );

    return {
      id: Number(result.insertId),
      name: productName,
      cleanup: async () => {
        await connection.execute("DELETE FROM products WHERE id = ?", [Number(result.insertId)]);
        await connection.end();
      },
    };
  } catch (error) {
    await connection.end();
    throw error;
  }
}

test("importacao de vendas mostra o produto ao digitar no vinculo", async ({ page }) => {
  const seededProduct = await seedImportSearchProduct();

  try {
    await page.route("**/api/trpc/**", async (route) => {
      const url = route.request().url();
      if (!url.includes("vendas.importFromUploadedFiles")) {
        await route.continue();
        return;
      }

      const draft = {
        fileName: "importacao-e2e.pdf",
        filePath: "/tmp/importacao-e2e.pdf",
        fileHash: `e2e-hash-${Date.now()}`,
        documentNumber: "DOC-E2E-001",
        parsedAt: new Date().toISOString(),
        cliente: "Cliente E2E",
        telefoneCliente: "11999999999",
        vendedor: "Cleonice",
        dataVenda: new Date().toISOString(),
        formaPagamento: "PIX",
        formasPagamentoExtraidas: [
          {
            descricao: "PIX",
            categoria: "instantaneo",
            vencimento: null,
            valor: 199,
            documento: null,
          },
        ],
        endereco: "Rua de Teste, 123",
        total: 199,
        desconto: 0,
        subtotal: 199,
        itens: [
          {
            productId: null,
            productName: "COLCHAO TESTE E2E",
            medida: "1.38x1.88",
            quantidade: 1,
            valorUnitario: 199,
            valorTotal: 199,
            confidence: 0.42,
            sourceLine: "COLCHAO TESTE E2E 1.38x1.88",
          },
        ],
        warnings: [],
        validationWarnings: [],
        validationErrors: [],
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            result: {
              data: {
                json: {
                  drafts: [draft],
                },
              },
            },
          },
        ]),
      });
    });

    await loginAsLocalAdmin(page);
    await page.goto("/vendas");
    await expect(page.getByTestId("sales-import-open")).toBeVisible();

    await page.getByTestId("sales-import-open").click();
    await expect(page.getByTestId("sales-import-dialog")).toBeVisible();

    await page.getByTestId("sales-import-file-input").setInputFiles({
      name: "importacao-e2e.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% E2E test file\n"),
    });

    await expect(page.getByTestId("sales-import-row-0")).toBeVisible();
    await page.getByTestId("sales-import-row-0").getByRole("checkbox").click();

    await page.getByTestId("sales-import-row-0-link-trigger").click();
    await page.getByTestId("sales-import-row-0-link-input").fill("playwright");

    await expect(
      page.getByTestId("sales-import-row-0-link-content").getByText(seededProduct.name),
    ).toBeVisible();
  } finally {
    await seededProduct.cleanup();
  }
});
