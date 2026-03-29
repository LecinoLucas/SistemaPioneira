import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import zlib from "node:zlib";
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

export type ImportedPaymentEntry = {
  descricao: string;
  categoria: "instantaneo" | "entrega" | "cartao" | "boleto" | "dinheiro" | "transferencia" | "outros";
  vencimento: string | null;
  valor: number | null;
  documento: string | null;
};

export type ImportedSaleDraft = {
  fileName: string;
  filePath: string;
  fileHash: string;
  documentNumber: string | null;
  parsedAt: string;
  cliente: string | null;
  telefoneCliente: string | null;
  vendedor: string | null;
  dataVenda: string | null;
  formaPagamento: string | null;
  formasPagamentoExtraidas: ImportedPaymentEntry[];
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

function categorizePaymentMethod(description: string): ImportedPaymentEntry["categoria"] {
  const normalized = normalizeText(description);
  if (normalized.includes("pix")) return "instantaneo";
  if (normalized.includes("receber na entrega") || normalized.includes("entrega")) return "entrega";
  if (normalized.includes("cartao") || normalized.includes("credito") || normalized.includes("debito")) return "cartao";
  if (normalized.includes("boleto")) return "boleto";
  if (normalized.includes("dinheiro") || normalized.includes("especie")) return "dinheiro";
  if (normalized.includes("transferencia") || normalized.includes("ted")) return "transferencia";
  return "outros";
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

function normalizeExtractedText(input: string): string {
  return input
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\(\s*(\d{2})\s*\)/g, "($1)")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
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

function extractInflatedPdfStreams(buffer: Buffer): string[] {
  const raw = buffer.toString("latin1");
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const streams: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(raw)) !== null) {
    const chunk = Buffer.from(match[1], "latin1");
    let inflated: Buffer | null = null;

    try {
      inflated = zlib.inflateSync(chunk);
    } catch {
      try {
        inflated = zlib.inflateRawSync(chunk);
      } catch {
        inflated = null;
      }
    }

    if (!inflated) continue;
    streams.push(inflated.toString("latin1"));
  }

  return streams;
}

function parseCMapMappings(stream: string): Array<Map<string, string>> {
  const cmapSections = stream.match(/beginbfchar[\s\S]*?endbfchar/g) ?? [];
  const maps: Array<Map<string, string>> = [];

  for (const section of cmapSections) {
    const map = new Map<string, string>();
    const pairRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let pair: RegExpExecArray | null;
    while ((pair = pairRegex.exec(section)) !== null) {
      map.set(pair[1].toUpperCase(), pair[2].toUpperCase());
    }
    if (map.size > 0) maps.push(map);
  }

  return maps;
}

function decodeHexUsingCMap(hex: string, map: Map<string, string>) {
  let output = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    const source = hex.slice(i, i + 4).toUpperCase();
    const target = map.get(source) ?? source;
    const codepoint = Number.parseInt(target, 16);
    if (Number.isFinite(codepoint)) {
      output += String.fromCodePoint(codepoint);
    }
  }
  return output;
}

function decodeHexPlain(hex: string): string {
  if (!hex || hex.length < 2) return "";
  const bytes = Buffer.from(hex, "hex");
  if (bytes.length === 0) return "";

  // Heurística para UTF-16BE comum em PDFs
  if (bytes.length >= 4 && bytes[0] === 0x00) {
    try {
      return bytes.toString("utf16le").replace(/\u0000/g, "");
    } catch {
      // fallback abaixo
    }
  }

  return bytes.toString("latin1");
}

function printableScore(input: string) {
  if (!input) return 0;
  const printable = (input.match(/[A-Za-zÀ-ÿ0-9\s,.:;\-\/()$]/g) ?? []).length;
  return printable / input.length;
}

function decodeHexTextFromPdf(hex: string, cmapMaps: Array<Map<string, string>>) {
  let best = "";
  let bestScore = 0;

  for (const map of cmapMaps) {
    const decoded = decodeHexUsingCMap(hex, map);
    const score = printableScore(decoded);
    if (score > bestScore) {
      best = decoded;
      bestScore = score;
    }
  }

  if (bestScore < 0.6) {
    return decodeHexPlain(hex);
  }
  return best;
}

function extractLiteralTextFromStream(stream: string): string[] {
  const out: string[] = [];

  const literalTjMatches = Array.from(stream.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g));
  for (const match of literalTjMatches) {
    const raw = match[0].replace(/\s*Tj$/, "");
    const inner = raw.slice(1, -1);
    const decoded = decodePdfEscapedText(inner);
    if (decoded && /[a-zA-ZÀ-ÿ0-9]/.test(decoded)) out.push(decoded);
  }

  const literalTjArrayMatches = Array.from(stream.matchAll(/\[([^\]]+)\]\s*TJ/g));
  for (const match of literalTjArrayMatches) {
    const literalParts = Array.from(match[1].matchAll(/\((?:\\.|[^\\)])*\)/g));
    for (const literal of literalParts) {
      const inner = literal[0].slice(1, -1);
      const decoded = decodePdfEscapedText(inner);
      if (decoded && /[a-zA-ZÀ-ÿ0-9]/.test(decoded)) out.push(decoded);
    }
  }

  return out;
}

function extractTextFromPdfCMap(buffer: Buffer): string {
  const streams = extractInflatedPdfStreams(buffer);
  if (!streams.length) return "";

  const cmapMaps: Array<Map<string, string>> = [];
  for (const stream of streams) {
    cmapMaps.push(...parseCMapMappings(stream));
  }

  const decodedParts: string[] = [];
  for (const stream of streams) {
    decodedParts.push(...extractLiteralTextFromStream(stream));

    const tjMatches = Array.from(stream.matchAll(/<([0-9A-Fa-f]{4,})>\s*Tj/g));
    for (const match of tjMatches) {
      const decoded = decodeHexTextFromPdf(match[1], cmapMaps);
      if (decoded) decodedParts.push(decoded);
    }

    const tjArrayMatches = Array.from(stream.matchAll(/\[([^\]]+)\]\s*TJ/g));
    for (const match of tjArrayMatches) {
      const hexMatches = Array.from(match[1].matchAll(/<([0-9A-Fa-f]{4,})>/g));
      for (const hexMatch of hexMatches) {
        const decoded = decodeHexTextFromPdf(hexMatch[1], cmapMaps);
        if (decoded) decodedParts.push(decoded);
      }
    }
  }

  return normalizeExtractedText(decodedParts.join("\n"));
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

function sanitizeFieldValue(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (
    /^cnpj\/?cpf:?$/i.test(cleaned) ||
    /^telefone:?$/i.test(cleaned) ||
    /^celular:?$/i.test(cleaned) ||
    /^vendedor:?$/i.test(cleaned) ||
    /^endere[cç]o:?$/i.test(cleaned)
  ) {
    return null;
  }
  if (/(cnpj\/?cpf:|endere[cç]o:|bairro:|cidade:|estado:|cep:)/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function parseTotals(text: string) {
  const subtotal = pickFieldByRegex(text, [
    /Sub\s*Total\s*[:\-]?\s*([\d.,]+)/i,
    /Subtotal\s*[:\-]?\s*([\d.,]+)/i,
    /Sub\s*Total\s*[:\-]?\s*[\r\n]+\s*([\d.,]+)/i,
  ]);
  const desconto = pickFieldByRegex(text, [/Desconto\s*[:\-]?\s*([\d.,]+)/i]);
  const descontoMultiLine = pickFieldByRegex(text, [/Desconto\s*[:\-]?\s*[\r\n]+\s*([\d.,]+)/i]);
  const acrescimo = pickFieldByRegex(text, [
    /Acrescimo\s*[:\-]?\s*([\d.,]+)/i,
    /Acr[ée]scimo\s*[:\-]?\s*([\d.,]+)/i,
    /Acr[ée]scimo\s*[:\-]?\s*[\r\n]+\s*([\d.,]+)/i,
  ]);
  const total = pickFieldByRegex(text, [
    /Total\s*(?:R\$)?\s*[:\-]?\s*([\d.,]+)/i,
    /Total\s*R\$\s*([\d.,]+)/i,
    /Total\s*R\$\s*[:\-]?\s*[\r\n]+\s*([\d.,]+)/i,
  ]);

  const parsedSubtotal = subtotal ? parseBrazilianCurrency(subtotal) : null;
  const parsedDesconto = desconto
    ? parseBrazilianCurrency(desconto)
    : descontoMultiLine
      ? parseBrazilianCurrency(descontoMultiLine)
      : null;
  const parsedAcrescimo = acrescimo ? parseBrazilianCurrency(acrescimo) : null;
  const parsedTotal = total ? parseBrazilianCurrency(total) : null;
  const totalAfterDiscount = pickFieldByRegex(text, [
    /Desconto\s*[:\-]?\s*[\d.,]+\s*([\d.,]+)\s*Aten[cç][aã]o/i,
  ]);
  const parsedTotalAfterDiscount = totalAfterDiscount ? parseBrazilianCurrency(totalAfterDiscount) : null;

  const computedTotal =
    parsedSubtotal != null
      ? parsedSubtotal - (parsedDesconto ?? 0) + (parsedAcrescimo ?? 0)
      : null;

  return {
    subtotal: parsedSubtotal,
    desconto: parsedDesconto,
    total: parsedTotalAfterDiscount ?? parsedTotal ?? computedTotal,
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
  const denominator = Math.max(2, Math.min(productTokens.length, 4));
  return Math.min(1, hits / denominator);
}

function extractPossibleItems(lines: string[]) {
  const itemLikeLines: string[] = [];

  for (const original of lines) {
    const line = original.trim();
    if (!line || line.length < 6) continue;
    if (/pix|receber na entrega|vencimento|documento|descri[cç][aã]o forma|total r\$/i.test(line)) continue;

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

  const personMatches = Array.from(text.matchAll(/\b(\d+\s*-\s*[A-ZÀ-ÿ][A-ZÀ-ÿ\s]{3,})\b/g)).map((m) =>
    m[1].replace(/\s+/g, " ").trim()
  );
  const clienteFromGrid = personMatches.length ? personMatches[0] : null;
  const clienteFromFlow = pickFieldByRegex(text, [
    /Vendedor:\s*(\d+\s*-\s*[A-ZÀ-ÿ][A-ZÀ-ÿ\s]+?)\s+\d{11,14}\b/i,
  ]);
  const enderecoFromGrid = pickFieldByRegex(text, [
    /Endere[cç]o:\s*([^:]+?)\s+Bairro:/i,
    /Endere[cç]o:\s*[\r\n]+\s*([^\n\r]+)/i,
    /Endere[cç]o\s*[:\-]?\s*([^\n\r]+)/i,
  ]);

  return {
    cliente: sanitizeFieldValue(cliente) ?? sanitizeFieldValue(clienteFromFlow) ?? sanitizeFieldValue(clienteFromGrid),
    endereco: sanitizeFieldValue(enderecoFromGrid) ?? sanitizeFieldValue(endereco),
  };
}

function parseBrDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(`${year}-${month}-${day}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function extractSalesMeta(text: string) {
  const telefoneCliente = pickFieldByRegex(text, [
    /Telefone\s*[:\-]\s*([^\n\r]+)/i,
    /Tel\.?\s*[:\-]\s*([^\n\r]+)/i,
    /Celular\s*[:\-]\s*([^\n\r]+)/i,
    /Fone\s*[:\-]\s*([^\n\r]+)/i,
  ]);

  const vendedor = pickFieldByRegex(text, [
    /Vendedor(?:a)?\s*[:\-]\s*([^\n\r]+)/i,
    /Atendente\s*[:\-]\s*([^\n\r]+)/i,
    /Representante\s*[:\-]\s*([^\n\r]+)/i,
  ]);
  const personMatches = Array.from(text.matchAll(/\b(\d+\s*-\s*[A-ZÀ-ÿ][A-ZÀ-ÿ\s]{3,})\b/g)).map((m) =>
    m[1].replace(/\s+/g, " ").trim()
  );
  const vendedorFromGrid = personMatches.length > 1 ? personMatches[1] : personMatches[0] ?? null;
  const vendedorFromFlow = pickFieldByRegex(text, [
    /\d{11,14}\s+\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}\s+(\d+\s*-\s*[A-ZÀ-ÿ][A-ZÀ-ÿ\s]+?)\s+Endere[cç]o:/i,
    /\d{11,14}\s+\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}\s+(\d+\s*-\s*[A-ZÀ-ÿ][A-ZÀ-ÿ\s]+)/i,
  ]);

  const formaPagamento = pickFieldByRegex(text, [
    /Forma\s*de\s*Pagamento\s*[:\-]\s*([^\n\r]+)/i,
    /Pagamento\s*[:\-]\s*([^\n\r]+)/i,
    /Cond(?:i[cç][aã]o|icao)\s*de\s*Pagamento\s*[:\-]\s*([^\n\r]+)/i,
  ]);
  const formaPagamentoFromRows = pickFieldByRegex(text, [
    /Documento\s+Descri[cç][aã]o\s+Forma[\s\S]*?\n\d+[^\n]*?\s+([A-ZÀ-ÿ ]+?)\s+\d{2}\/\d{2}\/\d{4}\s+[\d.,]+/i,
  ]);

  const dataRaw = pickFieldByRegex(text, [
    /Data\s*[:\-]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /Emiss[aã]o\s*[:\-]\s*(\d{2}\/\d{2}\/\d{4})/i,
  ]);
  const dataVenda = parseBrDate(dataRaw);
  const phoneMatch = text.match(/\(?\d{2}\)?\s*\d{4,5}[-\s]\d{4}/);
  const telefoneFromText = phoneMatch?.[0]?.replace(/\s+/g, " ").trim() ?? null;

  const paymentEntries: ImportedPaymentEntry[] = [];
  const paymentRegex = /(\d{4,}\s+\d{2}\/\d{2})\s+([A-ZÀ-ÿ ]+?)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)/gi;
  let paymentMatch: RegExpExecArray | null;
  while ((paymentMatch = paymentRegex.exec(text)) !== null) {
    const descricao = paymentMatch[2].replace(/\s+/g, " ").trim();
    const documento = paymentMatch[1].trim();
    const vencimento = parseBrDate(paymentMatch[3]);
    const valor = parseBrazilianCurrency(paymentMatch[4]);
    if (!descricao) continue;
    paymentEntries.push({
      descricao,
      categoria: categorizePaymentMethod(descricao),
      vencimento,
      valor,
      documento,
    });
  }

  return {
    telefoneCliente: sanitizeFieldValue(telefoneCliente) ?? sanitizeFieldValue(telefoneFromText),
    vendedor: sanitizeFieldValue(vendedorFromFlow) ?? sanitizeFieldValue(vendedor) ?? sanitizeFieldValue(vendedorFromGrid),
    formaPagamento: sanitizeFieldValue(formaPagamento) ?? sanitizeFieldValue(formaPagamentoFromRows),
    formasPagamentoExtraidas: paymentEntries,
    dataVenda,
  };
}

function extractStructuredItems(lines: string[]) {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const code = lines[i]?.trim();
    const qty = lines[i + 1]?.trim();
    const unit = lines[i + 2]?.trim();
    const desc = lines[i + 3]?.trim();
    const unitPrice = lines[i + 4]?.trim();
    const total = lines[i + 5]?.trim();

    if (!code || !qty || !unit || !desc || !unitPrice || !total) continue;
    if (!/^\d{3,}$/.test(code)) continue;
    if (!/^\d+[.,]\d{3}$/.test(qty) && !/^\d+[.,]\d+$/.test(qty)) continue;
    if (!/^[A-Z]{1,4}$/.test(unit)) continue;
    if (!/\d/.test(unitPrice) || !/\d/.test(total)) continue;
    if (!/[A-ZÀ-ÿ]{3,}/i.test(desc)) continue;

    out.push(`${qty} ${unit} ${desc} ${unitPrice} ${total}`);
  }
  return out;
}

function extractItemsFromFullText(text: string) {
  const items: string[] = [];
  const compact = text.replace(/\r/g, "\n");
  const regex =
    /(\d{1,3}[.,]\d{3}|\d{1,3})\s+(UN|PC|P[CÇ]|CX|JG|KIT)\s+([A-ZÀ-ÿ0-9][A-ZÀ-ÿ0-9\s./-]{4,}?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(compact)) !== null) {
    const qty = match[1].trim();
    const unit = match[2].trim();
    const desc = match[3].replace(/\s+/g, " ").trim();
    const unitPrice = match[4].trim();
    const total = match[5].trim();
    if (!desc) continue;
    items.push(`${qty} ${unit} ${desc} ${unitPrice} ${total}`);
  }
  return items;
}

function fallbackClientFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.pdf$/i, "");
  const cleaned = base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 4) return null;
  if (!/[a-zA-ZÀ-ÿ]/.test(cleaned)) return null;
  return cleaned;
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

  private buildDraftFromText(
    text: string,
    fileName: string,
    filePath: string,
    fileHash: string,
    productIndex: Array<{ product: ProductLite; normalized: string; tokens: string[] }>,
    warnings: string[]
  ): ImportedSaleDraft {
    const { cliente, endereco } = extractClientAndAddress(text);
    const { telefoneCliente, vendedor, formaPagamento, formasPagamentoExtraidas, dataVenda } = extractSalesMeta(text);
    const documentNumber = extractDocumentNumber(text);
    const totals = parseTotals(text);

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const itemLikeLines = Array.from(
      new Set([...extractPossibleItems(lines), ...extractStructuredItems(lines), ...extractItemsFromFullText(text)])
    );
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

    const resolvedClient = cliente ?? fallbackClientFromFileName(fileName);

    if (!resolvedClient) warnings.push("Cliente não identificado automaticamente.");
    if (!endereco) warnings.push("Endereço não identificado automaticamente.");
    if (itens.length === 0) warnings.push("Nenhum item de venda encontrado automaticamente.");
    if (
      !resolvedClient &&
      !telefoneCliente &&
      !vendedor &&
      !formaPagamento &&
      itens.length === 0
    ) {
      warnings.push("PDF possivelmente sem camada de texto (digitalizado).");
    }

    return {
      fileName,
      filePath,
      fileHash,
      documentNumber,
      parsedAt: new Date().toISOString(),
      cliente: resolvedClient,
      telefoneCliente,
      vendedor,
      formaPagamento,
      formasPagamentoExtraidas,
      dataVenda,
      endereco,
      subtotal: totals.subtotal,
      desconto: totals.desconto,
      total: totals.total,
      itens,
      warnings,
    };
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
      text = normalizeExtractedText(parsedByPdftotext);
    } else {
      const cmapText = extractTextFromPdfCMap(buffer);
      if (cmapText.trim().length > 30) {
        warnings.push("pdftotext não disponível, usando parser interno avançado (CMap).");
        text = cmapText;
      } else {
        warnings.push("pdftotext não disponível, usando extração interna básica (precisão menor).");
        text = normalizeExtractedText(extractTextFromPdfFallback(buffer));
      }
    }

    if (!text || text.trim().length < 10) {
      warnings.push("Não foi possível extrair texto suficiente deste PDF.");
    }

    return this.buildDraftFromText(text, fileName, filePath, fileHash, productIndex, warnings);
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
      text = normalizeExtractedText(parsedByPdftotext);
    } else {
      const cmapText = extractTextFromPdfCMap(buffer);
      if (cmapText.trim().length > 30) {
        warnings.push("pdftotext não disponível, usando parser interno avançado (CMap).");
        text = cmapText;
      } else {
        warnings.push("pdftotext não disponível, usando extração interna básica (precisão menor).");
        text = normalizeExtractedText(extractTextFromPdfFallback(buffer));
      }
    }

    if (!text || text.trim().length < 10) {
      warnings.push("Não foi possível extrair texto suficiente deste PDF.");
    }

    return this.buildDraftFromText(text, fileName, fileName, fileHash, productIndex, warnings);
  }
}
