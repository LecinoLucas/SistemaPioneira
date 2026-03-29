import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const SOCKET_CANDIDATES = [
  "/tmp/mysql.sock",
  "/opt/homebrew/var/run/mysql.sock",
  "/usr/local/var/mysql/mysql.sock",
];

function toInt(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[v2-reconcile] DATABASE_URL não definido.");
    process.exit(1);
  }

  let conn;
  try {
    conn = await mysql.createConnection(databaseUrl);
  } catch {
    const parsed = new URL(databaseUrl);
    const database = parsed.pathname.replace(/^\//, "");
    const user = decodeURIComponent(parsed.username || "root");
    const password = decodeURIComponent(parsed.password || "");

    for (const socketPath of SOCKET_CANDIDATES) {
      try {
        conn = await mysql.createConnection({
          user,
          password,
          database,
          socketPath,
        });
        break;
      } catch {
        // try next socket
      }
    }
  }
  if (!conn) {
    throw new Error("Não foi possível conectar ao MySQL (TCP/socket).");
  }
  try {
    const [legacyProductsRows] = await conn.query("SELECT COUNT(*) AS count FROM products");
    const [v2ProductsRows] = await conn.query("SELECT COUNT(*) AS count FROM products_v2");
    const [legacyMovRows] = await conn.query("SELECT COUNT(*) AS count FROM movimentacoes");
    const [v2MovRows] = await conn.query(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type = 'LEGACY_MOV'"
    );

    const [missingProductMapRows] = await conn.query(`
      SELECT COUNT(*) AS count
      FROM products p
      LEFT JOIN catalog_brands b
        ON b.name = CASE
          WHEN p.marca IS NULL OR TRIM(p.marca) = '' THEN 'SEM_MARCA'
          ELSE TRIM(p.marca)
        END
      LEFT JOIN catalog_measures m ON m.description = TRIM(p.medida)
      LEFT JOIN catalog_product_types t ON t.name = TRIM(p.categoria)
      LEFT JOIN catalog_models cm
        ON cm.brand_id = b.id
        AND cm.product_type_id = t.id
        AND cm.name = TRIM(p.name)
      LEFT JOIN products_v2 pv2
        ON pv2.brand_id = b.id
        AND pv2.measure_id = m.id
        AND pv2.product_type_id = t.id
        AND pv2.model_id = cm.id
      WHERE pv2.id IS NULL
    `);

    const [missingMovMapRows] = await conn.query(`
      SELECT COUNT(*) AS count
      FROM movimentacoes mov
      LEFT JOIN inventory_movements im
        ON im.reference_type = 'LEGACY_MOV'
       AND im.reference_id = CAST(mov.id AS CHAR) COLLATE utf8mb4_unicode_ci
      WHERE im.id IS NULL
    `);

    const [stockDiffRows] = await conn.query(`
      SELECT COUNT(*) AS count
      FROM products p
      JOIN catalog_brands b
        ON b.name = CASE
          WHEN p.marca IS NULL OR TRIM(p.marca) = '' THEN 'SEM_MARCA'
          ELSE TRIM(p.marca)
        END
      JOIN catalog_measures m ON m.description = TRIM(p.medida)
      JOIN catalog_product_types t ON t.name = TRIM(p.categoria)
      JOIN catalog_models cm
        ON cm.brand_id = b.id
       AND cm.product_type_id = t.id
       AND cm.name = TRIM(p.name)
      JOIN products_v2 pv2
        ON pv2.brand_id = b.id
       AND pv2.measure_id = m.id
       AND pv2.product_type_id = t.id
       AND pv2.model_id = cm.id
      JOIN branches br ON br.code = 'MATRIZ'
      JOIN inventory_balances ib
        ON ib.branch_id = br.id
       AND ib.product_id = pv2.id
      WHERE p.quantidade <> ib.on_hand
    `);

    const metrics = {
      legacyProducts: toInt(legacyProductsRows[0]?.count),
      v2Products: toInt(v2ProductsRows[0]?.count),
      legacyMovements: toInt(legacyMovRows[0]?.count),
      v2LegacyMirroredMovements: toInt(v2MovRows[0]?.count),
      legacyProductsWithoutV2: toInt(missingProductMapRows[0]?.count),
      legacyMovementsMissingInV2: toInt(missingMovMapRows[0]?.count),
      stockDiffCount: toInt(stockDiffRows[0]?.count),
    };

    const hasFailure =
      metrics.legacyProductsWithoutV2 > 0 ||
      metrics.legacyMovementsMissingInV2 > 0 ||
      metrics.stockDiffCount > 0;

    const summary = {
      timestamp: new Date().toISOString(),
      status: hasFailure ? "FAIL" : "PASS",
      metrics,
    };

    const backupDir = path.resolve("backups", "v2-reconcile");
    fs.mkdirSync(backupDir, { recursive: true });
    const fileName = `reconcile_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const filePath = path.join(backupDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), "utf8");

    console.log("[v2-reconcile] Status:", summary.status);
    console.table(metrics);
    console.log("[v2-reconcile] Log salvo em:", filePath);

    if (hasFailure) {
      process.exit(2);
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error("[v2-reconcile] Erro:", error);
  process.exit(1);
});
