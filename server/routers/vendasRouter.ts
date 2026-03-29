/**
 * Compat layer:
 * Mantém o ponto de entrada legado enquanto a arquitetura nova
 * vive em modules/vendas (presentation/application/domain/infrastructure).
 */
export { vendasRouter } from "../modules/vendas/presentation/trpc/vendas.router";
