import { spawnSync } from "node:child_process";

const commands = [
  { cmd: "brew", args: ["services", "start", "mysql"], label: "brew services start mysql" },
  { cmd: "mysql.server", args: ["start"], label: "mysql.server start" },
];

function run(command) {
  const result = spawnSync(command.cmd, command.args, { stdio: "inherit" });
  if (result.error) return false;
  return (result.status ?? 1) === 0;
}

for (const command of commands) {
  const ok = run(command);
  if (ok) {
    console.log(`[db-start] Comando executado com sucesso: ${command.label}`);
    process.exit(0);
  }
}

console.error(
  "[db-start] Não consegui iniciar o MySQL automaticamente. Inicie manualmente seu serviço MySQL e rode `npm run db:check`."
);
process.exit(1);
