import { drizzle } from "drizzle-orm/mysql2";
import { products } from "../../drizzle/schema.js";

const db = drizzle(process.env.DATABASE_URL);

const queenProducts = [
  { nome: "BRAVISSIMO", marca: "AMERICANFLEX", quantidade: 1 },
  { nome: "ADAPTO", marca: "ECOFLEX", quantidade: 1 },
  { nome: "ALVA", marca: "ECOFLEX", quantidade: 3 },
  { nome: "CRYSTAL", marca: "KING KOIL", quantidade: 1 },
  { nome: "DIAMOND", marca: "KING KOIL", quantidade: 1 },
  { nome: "XL FIRME", marca: "KING KOIL", quantidade: 2 },
  { nome: "BLEND", marca: "ECOFLEX", quantidade: 1 },
  { nome: "COMFY", marca: "ECOFLEX", quantidade: 2 },
  { nome: "JOY", marca: "PLUMATEX/ SEALY", quantidade: 0 },
  { nome: "ESMERALDA", marca: "PROBEL", quantidade: 0 },
  { nome: "LUSH", marca: "ECOFLEX", quantidade: 0 },
  { nome: "GUARDA COSTA FORCE EXTREME", marca: "PROBEL", quantidade: 0 },
  { nome: "HERVAL INSPIRACION ONE", marca: "HERVAL", quantidade: 1 },
  { nome: "DREAM", marca: "INDUCOL", quantidade: 0 },
  { nome: "GEO", marca: "ECOFLEX", quantidade: 1 },
  { nome: "CONFORT GEL", marca: "PLUMATEX/ SEALY", quantidade: 2 },
  { nome: "SMART CLASSIC", marca: "PLUMATEX", quantidade: 1 },
  { nome: "SMART MILANO", marca: "PLUMATEX", quantidade: 2 },
  { nome: "SEATTLE EXTRA FIRM", marca: "SIMMONS", quantidade: 1 },
  { nome: "COL SEATLE B (TECIDO BRANCO)", marca: "SIMMONS", quantidade: 0 },
  { nome: "PHOENIX", marca: "PLUMATEX/ SEALY", quantidade: 1 },
  { nome: "PEARL", marca: "KING KOIL", quantidade: 6 },
  { nome: "AMBER", marca: "KING KOIL", quantidade: 4 },
  { nome: "TITANIUM SIMMONS", marca: "SIMMONS", quantidade: 0 },
  { nome: "REPAIR", marca: "KING KOIL", quantidade: 1 },
  { nome: "REFORCE AMX 34CM", marca: "AMERICANFLEX", quantidade: 0 },
  { nome: "RELAX ADORABILE", marca: "ECOFLEX", quantidade: 1 },
  { nome: "WISH", marca: "INDUCOL", quantidade: 3 },
  { nome: "WIND", marca: "INDUCOL", quantidade: 2 },
  { nome: "STRESS FREE", marca: "PLUMATEX", quantidade: 0 },
  { nome: "ECOLIFE", marca: "PLUMATEX", quantidade: 1 },
  { nome: "KOLN", marca: "HERVAL", quantidade: 0 },
  { nome: "CONFORT HOSPITALITTY", marca: "KING KOIL", quantidade: 3 },
  { nome: "SELECTO D45", marca: "PLUMATEX", quantidade: 0 },
  { nome: "MALAGA", marca: "HERVAL", quantidade: 1 },
  { nome: "MIAMI", marca: "PLUMATEX/ SEALY", quantidade: 2 },
  { nome: "VIVERE", marca: "HERVAL", quantidade: 0 },
  { nome: "PLEACE", marca: "FLEX", quantidade: 4 },
  { nome: "VIENA", marca: "FLEX", quantidade: 2 },
  { nome: "TUNGSTEM", marca: "KING KOIL", quantidade: 2 },
];

async function importProducts() {
  console.log("Iniciando importação de produtos Queen...");
  
  let imported = 0;
  let skipped = 0;
  
  for (const product of queenProducts) {
    try {
      await db.insert(products).values({
        nome: product.nome,
        medida: "Queen",
        categoria: "Colchões",
        quantidade: product.quantidade,
        estoqueMinimo: 2,
        precoCusto: null,
        precoVenda: null,
      });
      imported++;
      console.log(`✓ Importado: ${product.nome} (${product.quantidade} unidades)`);
    } catch (error) {
      skipped++;
      console.log(`✗ Erro ao importar ${product.nome}:`, error.message);
    }
  }
  
  console.log(`\n✅ Importação concluída!`);
  console.log(`   - Produtos importados: ${imported}`);
  console.log(`   - Produtos com erro: ${skipped}`);
  console.log(`   - Total: ${queenProducts.length}`);
}

importProducts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Erro fatal:", error);
    process.exit(1);
  });
