import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const SOCKET_CANDIDATES = [
  "/tmp/mysql.sock",
  "/opt/homebrew/var/run/mysql.sock",
  "/usr/local/var/mysql/mysql.sock",
];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[db-check] DATABASE_URL não definido.");
  process.exit(1);
}

let conn;
try {
  conn = await mysql.createConnection(databaseUrl);
  const [rows] = await conn.query("SELECT 1 AS ok");
  const ok = Number(rows?.[0]?.ok ?? 0) === 1;
  if (!ok) {
    console.error("[db-check] Conexão aberta, mas teste SELECT falhou.");
    process.exit(2);
  }
  console.log("[db-check] Banco acessível e saudável.");
} catch (error) {
  let connected = false;
  for (const socketPath of SOCKET_CANDIDATES) {
    try {
      const parsed = new URL(databaseUrl);
      const dbName = parsed.pathname.replace(/^\//, "");
      const user = decodeURIComponent(parsed.username || "root");
      const password = decodeURIComponent(parsed.password || "");
      conn = await mysql.createConnection({
        user,
        password,
        database: dbName,
        socketPath,
      });
      const [rows] = await conn.query("SELECT 1 AS ok");
      const ok = Number(rows?.[0]?.ok ?? 0) === 1;
      if (ok) {
        console.log(`[db-check] Banco acessível via socket (${socketPath}).`);
        connected = true;
        break;
      }
    } catch {
      // try next socket
    }
  }

  if (!connected) {
    const asAny = error;
    const details = {
      message: error instanceof Error ? error.message : String(error),
      code: asAny?.code,
      errno: asAny?.errno,
      address: asAny?.address,
      port: asAny?.port,
    };
    console.error("[db-check] Falha de conexão:", details);
    process.exit(1);
  }
} finally {
  if (conn) {
    await conn.end().catch(() => undefined);
  }
}
