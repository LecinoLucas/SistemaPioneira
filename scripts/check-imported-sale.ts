import * as db from "../server/db";

async function main() {
  try {
    console.log("=== listImportedSalesLogs (latest 20) ===");
    const imported = await db.listImportedSalesLogs({ page: 1, pageSize: 20 });
    console.log(JSON.stringify(imported.items, null, 2));

    console.log("\n=== getVendasPaginated (page 1, limit 100) ===");
    const vendas = await db.getVendasPaginated(1, 100);
    console.log(JSON.stringify({ total: vendas.total, currentPage: vendas.currentPage, vendas: vendas.vendas.slice(0, 50) }, null, 2));

    // Provide a simple correlation hint: look for vendas that match imported log by date and seller
    console.log("\n=== Correlation hints (match by dataVenda and vendedor) ===");
    for (const log of imported.items) {
      if (!log.dataVenda) continue;
      const logDate = new Date(log.dataVenda).toISOString();
      const matches = vendas.vendas.filter(v => v.dataVenda && new Date(v.dataVenda).toISOString().startsWith(logDate.slice(0,10)) && (v.vendedor === log.vendedor || String(log.vendedor).includes(String(v.vendedor))));
      console.log(`Log file=${log.fileName} fileHash=${log.fileHash} dataVenda=${log.dataVenda} vendedor=${log.vendedor} -> matches=${matches.length}`);
    }

    process.exit(0);
  } catch (err) {
    console.error("Erro ao verificar DB:", err);
    process.exit(1);
  }
}

main();
