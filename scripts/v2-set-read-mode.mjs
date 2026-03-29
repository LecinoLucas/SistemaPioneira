import fs from "node:fs";
import path from "node:path";

const allowed = new Set(["legacy", "shadow", "v2"]);
const mode = (process.argv[2] || "").toLowerCase();

function readCurrentMode(content) {
  const match = content.match(/^STOCK_V2_READ_MODE=(.+)$/m);
  return match?.[1]?.trim() || "(não definido)";
}

if (mode && !allowed.has(mode)) {
  console.error("[v2-set-read-mode] Use: legacy | shadow | v2");
  process.exit(1);
}

const envPath = path.resolve(".env");
if (!fs.existsSync(envPath)) {
  console.error("[v2-set-read-mode] Arquivo .env não encontrado.");
  process.exit(1);
}

const content = fs.readFileSync(envPath, "utf8");

if (!mode) {
  console.log(`[v2-set-read-mode] STOCK_V2_READ_MODE atual: ${readCurrentMode(content)}`);
  process.exit(0);
}

const line = `STOCK_V2_READ_MODE=${mode}`;

let next = content;
if (/^STOCK_V2_READ_MODE=.*/m.test(content)) {
  next = content.replace(/^STOCK_V2_READ_MODE=.*/m, line);
} else {
  next = `${content.trimEnd()}\n${line}\n`;
}

fs.writeFileSync(envPath, next, "utf8");
console.log(`[v2-set-read-mode] STOCK_V2_READ_MODE -> ${mode}`);
