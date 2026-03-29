/**
 * Compat layer:
 * Mantém o ponto de entrada legado enquanto a arquitetura nova
 * vive em modules/products (presentation/application/domain/infrastructure).
 */
export { productsRouter } from "../modules/products/presentation/trpc/products.router";
