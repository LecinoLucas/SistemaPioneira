import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

function fail(message) {
  console.error(`[exec-mysql-file] ${message}`);
  process.exit(1);
}

const fileArg = process.argv[2];
if (!fileArg) {
  fail("Informe o caminho do arquivo SQL. Exemplo: node scripts/exec-mysql-file.mjs scripts/sql/check.sql");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail("DATABASE_URL não está definido no .env");
}

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  fail("DATABASE_URL inválido");
}

if (parsed.protocol !== "mysql:") {
  fail(`Protocolo não suportado em DATABASE_URL: ${parsed.protocol}`);
}

const host = parsed.hostname || "127.0.0.1";
const port = parsed.port || "3306";
const user = decodeURIComponent(parsed.username || "root");
const password = decodeURIComponent(parsed.password || "");
const database = (parsed.pathname || "").replace(/^\//, "");

if (!database) {
  fail("DATABASE_URL precisa conter o nome do banco (path)");
}

const sqlFilePath = path.resolve(fileArg);
const sqlContent = fs.readFileSync(sqlFilePath, "utf8");
const args = ["-h", host, "-P", port, "-u", user, database];
const run = (runArgs) =>
  spawnSync("mysql", runArgs, {
    stdio: ["pipe", "inherit", "inherit"],
    input: sqlContent,
    env: { ...process.env, MYSQL_PWD: password },
  });

let result = run(args);
if ((result.status ?? 1) !== 0) {
  // fallback socket mode for local mysql installations
  const socketCandidates = ["/tmp/mysql.sock", "/opt/homebrew/var/run/mysql.sock", "/usr/local/var/mysql/mysql.sock"];
  for (const socketPath of socketCandidates) {
    result = run(["--socket", socketPath, "-u", user, database]);
    if ((result.status ?? 1) === 0) break;
  }
}

if (result.error) {
  fail(`Erro ao executar mysql: ${result.error.message}`);
}

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`[exec-mysql-file] OK: ${path.relative(process.cwd(), sqlFilePath)}`);
