import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import { ENV } from "../../../../_core/env";

type ProductLite = {
  id: number;
  name: string;
  medida: string;
  quantidade: number;
};

export type ImportedSaleItem = {
  productId: number | null;
  productName: string;
  medida: string | null;
  quantidade: number;
  valorUnitario: number | null;
  valorTotal: number | null;
  confidence: number;
  sourceLine: string;
};

export type ImportedSaleDraft = {
  fileName: string;
  filePath: string;
  fileHash: string;
  documentNumber: string | null;
  parsedAt: string;
  cliente: string | null;
  endereco: string | null;
  total: number | null;
  desconto: number | null;
  subtotal: number | null;
  itens: ImportedSaleItem[];
  warnings: string[];
};

function normalizeText(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBrazilianCurrency(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9,.-]/g, "").trim();
  if (!cleaned) return null;

  const normalized = cleaned
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseIntSafe(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodePdfEscapedText(raw: string): string {
  return raw
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function extractTextFromPdfFallback(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const groups = raw.match(/\((?:\\.|[^\\)])*\)/g) ?? [];
  const decoded = groups
    .map((chunk) => chunk.slice(1, -1))
    .map(decodePdfEscapedText)
    .filter((line) => /[a-zA-Z0-9]/.test(line));
  return decoded.join("\n");
}

function tryPdftotext(filePath: string): string | null {
  const run = spawnSync("pdftotext", ["-layout", "-enc", "UTF-8", filePath, "-"], {
    encoding: "utf8",
    timeout: 12_000,
    maxBuffer: 20 * 1024 * 1024,
  });

  if (run.status === 0 && run.stdout && run.stdout.trim().length > 20) {
    return run.stdout;
  }

  return null;
}

async function tryPdftotextFromBuffer(fileName: string, buffer: Buffer): Promise<string | null> {
  const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const tempPath = path.join(os.tmpdir(), `sales-import-${Date.now()}-${safeName}`);

  try {
    await fs.writeFile(tempPath, buffer);
    return tryPdftotext(tempPath);
  } catch {
    return null;
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
}

function pickFieldByRegex(text: string, regexes: RegExp[]): string | null {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function parseTotals(text: string) {
  const subtotal = pickFieldByRegex(text, [
    /Sub\s*Total\s*[:\-]?\s*([\d.,]+)/i,
    /Subtotal\s*[:\-]?\s*([\d.,]+)/i,
  ]);
  const desconto = pickFieldByRegex(text, [/Desconto\s*[:\-]?\s*([\d.,]+)/i]);
  const total = pickFieldByRegex(text, [
    /Total\s*(?:R\$)?\s*[:\-]?\s*([\d.,]+)/i,
    /Total\s*R\$\s*([\d.,]+)/i,
  ]);

  return {
    subtotal: subtotal ? parseBrazilianCurrency(subtotal) : null,
    desconto: desconto ? parseBrazilianCurrency(desconto) : null,
    total: total ? parseBrazilianCurrency(total) : null,
  };
}

function extractDocumentNumber(text: string): string | null {
  const match = text.match(/(?:N[úu]mero|Numero|N[oº]|No\.?)\s*[:\-]?\s*(\d{4,})/i);
  if (match?.[1]) return match[1].trim();
  return null;
}

function tokenizeProductName(name: string) {
  return normalizeText(name)
    .split(" ")
    .filter((token) => token.length >= 3);
}

function scoreLineAgainstProduct(lineNormalized: string, productTokens: string[]): number {
  if (!lineNormalized || productTokens.length === 0) return 0;

  const lineTokens = new Set(lineNormalized.split(" "));
  let hits = 0;
  for (const token of productTokens) {
    if (lineTokens.has(token)) hits += 1;
  }
  return hits / productTokens.length;
}

function extractPossibleItems(lines: string[]) {
  const itemLikeLines: string[] = [];

  for (const original of lines) {
    const line = original.trim();
    if (!line || line.length < 6) continue;

    const hasAmount = /\b\d+[.,]\d{2}\b/.test(line);
    const hasQty = /\b\d{1,3}\b/.test(line);
    const hasLetters = /[a-zA-ZÀ-ÿ]{3,}/.test(line);

    if (hasLetters && hasQty && hasAmount) {
      itemLikeLines.push(line);
      continue;
    }

    if (hasLetters && /\b(un|pc|pç|cx|jg|kit)\b/i.test(line)) {
      itemLikeLines.push(line);
    }
  }

  return itemLikeLines;
}

function parseQuantityFromLine(line: string): number {
  const matches = Array.from(line.matchAll(/\b(\d{1,3})\b/g)).map((m) => Number.parseInt(m[1], 10));
  const qty = matches.find((n) => Number.isFinite(n) && n >= 1 && n <= 200);
  return qty ?? 1;
}

function parseCurrencyNumbersFromLine(line: string): number[] {
  return Array.from(line.matchAll(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g))
    .map((m) => parseBrazilianCurrency(m[0]))
    .filter((v): v is number => typeof v === "number");
}

function extractClientAndAddress(text: string) {
  const cliente = pickFieldByRegex(text, [
    /Cliente\s*[:\-]\s*([^\n\r]+)/i,
    /Nome\s*Cliente\s*[:\-]\s*([^\n\r]+)/i,
    /Cl[ie]ente\s*[:\-]\s*([^\n\r]+)/i,
  ]);

  const endereco = pickFieldByRegex(text, [
    /Endere[cç]o\s*[:\-]\s*([^\n\r]+)/i,
    /Rua\s*[:\-]\s*([^\n\r]+)/i,
  ]);

  return { cliente, endereco };
}

export class PdfSalesImportService {
  async parseFolder(input: { folderPath?: string; maxFiles?: number }, products: ProductLite[]): Promise<ImportedSaleDraft[]> {
    const basePath = input.folderPath?.trim() || ENV.salesImportDir;
    if (!basePath) {
      throw new Error("Defina SALES_IMPORT_DIR no .env para habilitar a importação de PDFs.");
    }

    const resolved = path.resolve(basePath);
    if (!existsSync(resolved)) {
      throw new Error(`Pasta de importação não encontrada: ${resolved}`);
    }

    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const pdfFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
      .map((entry) => path.join(resolved, entry.name))
      .sort((a, b) => b.localeCompare(a));

    const maxFiles = Math.max(1, Math.min(input.maxFiles ?? 30, 100));
    const selected = pdfFiles.slice(0, maxFiles);

    const productIndex = products.map((product) => ({
      product,
      normalized: normalizeText(product.name),
      tokens: tokenizeProductName(product.name),
    }));

    const drafts: ImportedSaleDraft[] = [];

    for (const filePath of selected) {
      const draft = await this.parseSingleFile(filePath, productIndex);
      drafts.push(draft);
    }

    return drafts;
  }

  async parseUploadedFiles(
    files: Array<{ fileName: string; fileBase64: string }>,
    products: ProductLite[]
  ): Promise<ImportedSaleDraft[]> {
    const productIndex = products.map((product) => ({
      product,
      normalized: normalizeText(product.name),
      tokens: tokenizeProductName(product.name),
    }));

    const drafts: ImportedSaleDraft[] = [];
    for (const file of files) {
      const buffer = Buffer.from(file.fileBase64, "base64");
      const draft = await this.parseSingleBuffer(file.fileName, buffer, productIndex);
      drafts.push(draft);
    }
    return drafts;
  }

  private async parseSingleFile(
    filePath: string,
    productIndex: Array<{ product: ProductLite; normalized: string; tokens: string[] }>
  ): Promise<ImportedSaleDraft> {
    const warnings: string[] = [];
    const fileName = path.basename(filePath);

    const buffer = await fs.readFile(filePath);
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const parsedByPdftotext = tryPdftotext(filePath);
    let text: string;

    if (parsedByPdftotext) {
      text = parsedByPdftotext;
    } else {
      warnings.push("pdftotext não disponível, usando extração interna (precisão menor).");
      text = extractTextFromPdfFallback(buffer);
    }

    if (!text || text.trim().length < 10) {
      warnings.push("Não foi possível extrair texto suficiente deste PDF.");
    }

    const { cliente, endereco } = extractClientAndAddress(text);
    const documentNumber = extractDocumentNumber(text);
    const totals = parseTotals(text);

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const itemLikeLines = extractPossibleItems(lines);
    const itens: ImportedSaleItem[] = [];

    for (const line of itemLikeLines) {
      const lineNormalized = normalizeText(line);
      if (!lineNormalized) continue;

      let bestMatch: { id: number; name: string; medida: string; score: number } | null = null;
      for (const candidate of productIndex) {
        const directContains = lineNormalized.includes(candidate.normalized);
        const score = directContains ? 1 : scoreLineAgainstProduct(lineNormalized, candidate.tokens);

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            id: candidate.product.id,
            name: candidate.product.name,
            medida: candidate.product.medida,
            score,
          };
        }
      }

      const qty = parseQuantityFromLine(line);
      const moneyValues = parseCurrencyNumbersFromLine(line);
      const valorTotal = moneyValues.length > 0 ? moneyValues[moneyValues.length - 1] : null;
      const valorUnitario = moneyValues.length > 1 ? moneyValues[moneyValues.length - 2] : null;

      if (!bestMatch || bestMatch.score < 0.45) {
        itens.push({
          productId: null,
          productName: line,
          medida: null,
          quantidade: qty,
          valorUnitario,
          valorTotal,
          confidence: bestMatch?.score ?? 0,
          sourceLine: line,
        });
        continue;
      }

      itens.push({
        productId: bestMatch.id,
        productName: bestMatch.name,
        medida: bestMatch.medida,
        quantidade: qty,
        valorUnitario,
        valorTotal,
        confidence: bestMatch.score,
        sourceLine: line,
      });
    }

    if (!cliente) warnings.push("Cliente não identificado automaticamente.");
    if (!endereco) warnings.push("Endereço não identificado automaticamente.");
    if (itens.length === 0) warnings.push("Nenhum item de venda encontrado automaticamente.");

    return {
      fileName,
      filePath,
      fileHash,
      documentNumber,
      parsedAt: new Date().toISOString(),
      cliente,
      endereco,
      subtotal: totals.subtotal,
      desconto: totals.desconto,
      total: totals.total,
      itens,
      warnings,
    };
  }

  private async parseSingleBuffer(
    fileName: string,
    buffer: Buffer,
    productIndex: Array<{ product: ProductLite; normalized: string; tokens: string[] }>
  ): Promise<ImportedSaleDraft> {
    const warnings: string[] = [];
    const fileHash = createHash("sha256").update(buffer).digest("hex");

    const parsedByPdftotext = await tryPdftotextFromBuffer(fileName, buffer);
    let text: string;
    if (parsedByPdftotext) {
      text = parsedByPdftotext;
    } else {
      warnings.push("pdftotext não disponível, usando extração interna (precisão menor).");
      text = extractTextFromPdfFallback(buffer);
    }

    if (!text || text.trim().length < 10) {
      warnings.push("Não foi possível extrair texto suficiente deste PDF.");
    }

    const { cliente, endereco } = extractClientAndAddress(text);
    const documentNumber = extractDocumentNumber(text);
    const totals = parseTotals(text);

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const itemLikeLines = extractPossibleItems(lines);
    const itens: ImportedSaleItem[] = [];

    for (const line of itemLikeLines) {
      const lineNormalized = normalizeText(line);
      if (!lineNormalized) continue;

      let bestMatch: { id: number; name: string; medida: string; score: number } | null = null;
      for (const candidate of productIndex) {
        const directContains = lineNormalized.includes(candidate.normalized);
        const score = directContains ? 1 : scoreLineAgainstProduct(lineNormalized, candidate.tokens);

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            id: candidate.product.id,
            name: candidate.product.name,
            medida: candidate.product.medida,
            score,
          };
        }
      }

      const qty = parseQuantityFromLine(line);
      const moneyValues = parseCurrencyNumbersFromLine(line);
      const valorTotal = moneyValues.length > 0 ? moneyValues[moneyValues.length - 1] : null;
      const valorUnitario = moneyValues.length > 1 ? moneyValues[moneyValues.length - 2] : null;

      if (!bestMatch || bestMatch.score < 0.45) {
        itens.push({
          productId: null,
          productName: line,
          medida: null,
          quantidade: qty,
          valorUnitario,
          valorTotal,
          confidence: bestMatch?.score ?? 0,
          sourceLine: line,
        });
        continue;
      }

      itens.push({
        productId: bestMatch.id,
        productName: bestMatch.name,
        medida: bestMatch.medida,
        quantidade: qty,
        valorUnitario,
        valorTotal,
        confidence: bestMatch.score,
        sourceLine: line,
      });
    }

    if (!cliente) warnings.push("Cliente não identificado automaticamente.");
    if (!endereco) warnings.push("Endereço não identificado automaticamente.");
    if (itens.length === 0) warnings.push("Nenhum item de venda encontrado automaticamente.");

    return {
      fileName,
      filePath: fileName,
      fileHash,
      documentNumber,
      parsedAt: new Date().toISOString(),
      cliente,
      endereco,
      subtotal: totals.subtotal,
      desconto: totals.desconto,
      total: totals.total,
      itens,
      warnings,
    };
  }
}
