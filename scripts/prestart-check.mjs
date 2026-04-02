import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config();

function runStep(label, cmd, args) {
  console.log(`\n[prestart] ${label}...`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`[prestart] Falhou em: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("[prestart] Iniciando validações do ambiente...");

runStep("Checando conexão com banco", process.execPath, ["scripts/db-check.mjs"]);

console.log("\n[prestart] Ambiente OK para subir o sistema.");
