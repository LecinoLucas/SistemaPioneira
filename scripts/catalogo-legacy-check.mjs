import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();

const rules = [
  {
    label: "Frontend usando namespace legado trpc.marcas",
    cmd: "rg -n \"trpc\\.marcas\\.\" client/src",
  },
  {
    label: "Chamadas manuais para endpoint legado /api/trpc/marcas",
    cmd: "rg -n \"/api/trpc/marcas\" client/src server",
  },
];

const issues = [];

for (const rule of rules) {
  try {
    const out = execSync(rule.cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const trimmed = out.trim();
    if (trimmed) {
      issues.push({ label: rule.label, details: trimmed });
    }
  } catch {
    // rg exits with code 1 when no matches; this is expected.
  }
}

const envPath = resolve(root, ".env");
let legacyEnabled = "(não definido - usa padrão true)";
try {
  const envRaw = readFileSync(envPath, "utf8");
  const line = envRaw
    .split("\n")
    .map((v) => v.trim())
    .find((v) => v.startsWith("LEGACY_MARCAS_ROUTER_ENABLED="));
  if (line) {
    legacyEnabled = line.split("=")[1] ?? "";
  }
} catch {
  // no .env at check time
}

if (issues.length > 0) {
  console.error("[catalogo:legacy:check] Foram encontrados pontos usando legado 'marcas'.");
  for (const issue of issues) {
    console.error(`\n- ${issue.label}`);
    console.error(issue.details);
  }
  console.error("\nCorrija os pontos acima antes de desligar LEGACY_MARCAS_ROUTER_ENABLED.");
  process.exit(1);
}

console.log("[catalogo:legacy:check] OK: nenhum uso legado encontrado no código.");
console.log(`[catalogo:legacy:check] LEGACY_MARCAS_ROUTER_ENABLED atual: ${legacyEnabled}`);
