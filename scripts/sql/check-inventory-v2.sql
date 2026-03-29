-- Estoque V2 - Checklist de consistencia pos-backfill
-- Rode apos normalize + backfill.

-- 1) Contagens basicas
SELECT 'legacy_products' AS metric, COUNT(*) AS total FROM products
UNION ALL
SELECT 'v2_products', COUNT(*) FROM products_v2
UNION ALL
SELECT 'legacy_movimentacoes', COUNT(*) FROM movimentacoes
UNION ALL
SELECT 'v2_movements_from_legacy', COUNT(*) FROM inventory_movements WHERE reference_type = 'LEGACY_MOV';

-- 2) Produtos sem vínculo legado->v2 (deveria ser 0)
SELECT COUNT(*) AS legacy_products_without_v2
FROM products p
LEFT JOIN legacy_product_links lpl
  ON lpl.legacy_product_id = p.id
WHERE lpl.product_v2_id IS NULL;

-- 3) Divergencia de saldo legado vs v2 (MATRIZ)
SELECT
  p.id AS legacy_product_id,
  p.name,
  p.medida,
  p.quantidade AS legacy_qty,
  ib.on_hand AS v2_on_hand,
  (p.quantidade - ib.on_hand) AS diff
FROM products p
JOIN legacy_product_links lpl
  ON lpl.legacy_product_id = p.id
JOIN products_v2 pv2
  ON pv2.id = lpl.product_v2_id
JOIN branches br
  ON br.code = 'MATRIZ'
JOIN inventory_balances ib
  ON ib.branch_id = br.id
 AND ib.product_id = pv2.id
WHERE p.quantidade <> ib.on_hand
ORDER BY ABS(p.quantidade - ib.on_hand) DESC, p.name
LIMIT 100;

-- 4) Movimentacoes legado sem espelho V2 (deveria ser 0)
SELECT COUNT(*) AS legacy_movements_missing_in_v2
FROM movimentacoes mov
LEFT JOIN inventory_movements im
  ON im.reference_type = 'LEGACY_MOV'
 AND im.reference_id = CAST(mov.id AS CHAR)
WHERE im.id IS NULL;

-- 5) Produtos duplicados por chave catalogo em v2 (deveria ser 0 linhas)
SELECT
  brand_id, measure_id, product_type_id, model_id,
  COUNT(*) AS total
FROM products_v2
GROUP BY brand_id, measure_id, product_type_id, model_id
HAVING COUNT(*) > 1;

-- 6) Legado com links duplicados (deveria ser 0 linhas)
SELECT
  legacy_product_id,
  COUNT(*) AS total
FROM legacy_product_links
GROUP BY legacy_product_id
HAVING COUNT(*) > 1;
