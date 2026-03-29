-- Ajuste pontual de trigger SKU V2 sem recriar índices/tabelas.
DROP TRIGGER IF EXISTS trg_products_v2_sku_after_insert;
DROP TRIGGER IF EXISTS trg_products_v2_sku_before_insert;
DELIMITER $$
CREATE TRIGGER trg_products_v2_sku_before_insert
BEFORE INSERT ON products_v2
FOR EACH ROW
BEGIN
  IF NEW.sku IS NULL OR NEW.sku = '' THEN
    SET NEW.sku = CONCAT('SKU-', UPPER(REPLACE(UUID(), '-', '')));
  END IF;
END$$
DELIMITER ;
