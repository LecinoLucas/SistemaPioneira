export type UserRole = "admin" | "gerente" | "user";

export type ScreenPath =
  | "/"
  | "/vendas"
  | "/historico"
  | "/produtos"
  | "/precos"
  | "/relatorio-vendas"
  | "/relatorio-encomendas"
  | "/rankings"
  | "/precos-margens"
  | "/marcas"
  | "/usuarios-pendentes"
  | "/auditoria"
  | "/componentes";

export type PermissionValue = boolean;

export type PermissionEntry = {
  permissionKey: string;
  allowed: PermissionValue;
};

type ScreenMeta = {
  path: ScreenPath;
  label: string;
  group: "Operação" | "Catálogo" | "Relatórios" | "Administração";
};

export const SCREEN_CATALOG: readonly ScreenMeta[] = [
  { path: "/", label: "Dashboard", group: "Operação" },
  { path: "/vendas", label: "Vendas", group: "Operação" },
  { path: "/historico", label: "Histórico", group: "Operação" },
  { path: "/produtos", label: "Produtos", group: "Catálogo" },
  { path: "/precos", label: "Preços", group: "Catálogo" },
  { path: "/relatorio-vendas", label: "Relatório de Vendas", group: "Relatórios" },
  { path: "/relatorio-encomendas", label: "Relatório de Encomendas", group: "Relatórios" },
  { path: "/rankings", label: "Rankings", group: "Relatórios" },
  { path: "/precos-margens", label: "Preços e Margens", group: "Administração" },
  { path: "/marcas", label: "Categorias", group: "Administração" },
  { path: "/usuarios-pendentes", label: "Usuários", group: "Administração" },
  { path: "/auditoria", label: "Auditoria", group: "Administração" },
  { path: "/componentes", label: "Componentes", group: "Administração" },
] as const;

const ALL_ROLES: readonly UserRole[] = ["admin", "gerente", "user"];
const ADMIN_AND_MANAGER: readonly UserRole[] = ["admin", "gerente"];
const ADMIN_ONLY: readonly UserRole[] = ["admin"];

/**
 * Matriz RBAC base (perfil).
 * Permissões por usuário complementam/restringem esse baseline.
 */
export const ROUTE_ACCESS: Record<ScreenPath, readonly UserRole[]> = {
  "/": ALL_ROLES,
  "/vendas": ALL_ROLES,
  "/historico": ALL_ROLES,
  "/produtos": ADMIN_AND_MANAGER,
  "/precos": ADMIN_AND_MANAGER,
  "/relatorio-vendas": ADMIN_AND_MANAGER,
  "/relatorio-encomendas": ADMIN_AND_MANAGER,
  "/rankings": ADMIN_AND_MANAGER,
  "/precos-margens": ADMIN_ONLY,
  "/marcas": ADMIN_ONLY,
  "/usuarios-pendentes": ADMIN_ONLY,
  "/auditoria": ADMIN_ONLY,
  "/componentes": ADMIN_ONLY,
};

export const ACTION_PERMISSION_CATALOG = [
  { key: "action:products.manage", label: "Gerenciar produtos", group: "Catálogo" },
  { key: "action:products.pricing", label: "Gerenciar preços", group: "Catálogo" },
  { key: "action:sales.manage", label: "Gerenciar vendas", group: "Operação" },
  { key: "action:orders.manage", label: "Gerenciar encomendas", group: "Operação" },
  { key: "action:users.approve", label: "Aprovar/Rejeitar usuários", group: "Administração" },
  { key: "action:users.promote", label: "Promover/Inativar usuários", group: "Administração" },
  { key: "action:users.permissions", label: "Editar permissões", group: "Administração" },
  { key: "action:audit.view", label: "Visualizar auditoria", group: "Administração" },
  { key: "action:audit.export", label: "Exportar auditoria", group: "Administração" },
] as const;

export type ActionPermissionKey = (typeof ACTION_PERMISSION_CATALOG)[number]["key"];

export type PermissionTemplate = {
  id: string;
  label: string;
  description: string;
  targetRoles: readonly UserRole[];
  entries: readonly PermissionEntry[];
};

const ROLE_ACTION_ACCESS: Record<UserRole, readonly ActionPermissionKey[]> = {
  admin: [
    "action:products.manage",
    "action:products.pricing",
    "action:sales.manage",
    "action:orders.manage",
    "action:users.approve",
    "action:users.promote",
    "action:users.permissions",
    "action:audit.view",
    "action:audit.export",
  ],
  gerente: [
    "action:products.manage",
    "action:sales.manage",
    "action:orders.manage",
  ],
  user: [],
};

export const PERMISSION_TEMPLATES: readonly PermissionTemplate[] = [
  {
    id: "admin_full_access",
    label: "Admin Completo",
    description: "Mantém acesso completo do perfil admin para todas as telas e ações.",
    targetRoles: ["admin"],
    entries: [],
  },
  {
    id: "admin_operacional",
    label: "Admin Operacional",
    description: "Admin sem gestão de usuários e sem exportação de auditoria.",
    targetRoles: ["admin"],
    entries: [
      { permissionKey: "action:users.approve", allowed: false },
      { permissionKey: "action:users.promote", allowed: false },
      { permissionKey: "action:users.permissions", allowed: false },
      { permissionKey: "action:audit.export", allowed: false },
      { permissionKey: "screen:/usuarios-pendentes:view", allowed: false },
    ],
  },
  {
    id: "admin_comercial",
    label: "Admin Comercial",
    description: "Foco em vendas e catálogo, sem governança de usuários e sem auditoria avançada.",
    targetRoles: ["admin"],
    entries: [
      { permissionKey: "action:users.approve", allowed: false },
      { permissionKey: "action:users.promote", allowed: false },
      { permissionKey: "action:users.permissions", allowed: false },
      { permissionKey: "action:audit.view", allowed: false },
      { permissionKey: "action:audit.export", allowed: false },
      { permissionKey: "screen:/usuarios-pendentes:view", allowed: false },
      { permissionKey: "screen:/auditoria:view", allowed: false },
    ],
  },
  {
    id: "admin_financeiro",
    label: "Admin Financeiro",
    description: "Admin com foco em relatórios e preços, sem operação diária de estoque/vendas.",
    targetRoles: ["admin"],
    entries: [
      { permissionKey: "action:sales.manage", allowed: false },
      { permissionKey: "action:orders.manage", allowed: false },
      { permissionKey: "action:products.manage", allowed: false },
      { permissionKey: "screen:/vendas:view", allowed: false },
      { permissionKey: "screen:/historico:view", allowed: false },
    ],
  },
  {
    id: "gerente_padrao",
    label: "Gerente Padrão",
    description: "Acesso operacional completo de gerente (sem módulos administrativos).",
    targetRoles: ["gerente"],
    entries: [],
  },
  {
    id: "gerente_consulta",
    label: "Gerente Consulta",
    description: "Gerente com visualização de operação, sem ações de edição.",
    targetRoles: ["gerente"],
    entries: [
      { permissionKey: "action:products.manage", allowed: false },
      { permissionKey: "action:sales.manage", allowed: false },
      { permissionKey: "action:orders.manage", allowed: false },
    ],
  },
  {
    id: "gerente_comercial",
    label: "Gerente Comercial",
    description: "Gerente focado em produtos e vendas; sem gestão de encomendas.",
    targetRoles: ["gerente"],
    entries: [{ permissionKey: "action:orders.manage", allowed: false }],
  },
  {
    id: "gerente_logistica",
    label: "Gerente Logística",
    description: "Gerente focado em encomendas e estoque; sem edição de vendas.",
    targetRoles: ["gerente"],
    entries: [{ permissionKey: "action:sales.manage", allowed: false }],
  },
  {
    id: "usuario_vendas_basico",
    label: "Usuário Vendas Básico",
    description: "Usuário com acesso somente a dashboard, vendas e histórico.",
    targetRoles: ["user"],
    entries: [
      { permissionKey: "screen:/produtos:view", allowed: false },
      { permissionKey: "screen:/precos:view", allowed: false },
      { permissionKey: "screen:/relatorio-vendas:view", allowed: false },
      { permissionKey: "screen:/relatorio-encomendas:view", allowed: false },
      { permissionKey: "screen:/rankings:view", allowed: false },
      { permissionKey: "screen:/precos-margens:view", allowed: false },
      { permissionKey: "screen:/marcas:view", allowed: false },
      { permissionKey: "screen:/usuarios-pendentes:view", allowed: false },
      { permissionKey: "screen:/auditoria:view", allowed: false },
      { permissionKey: "screen:/componentes:view", allowed: false },
    ],
  },
  {
    id: "usuario_consulta",
    label: "Usuário Consulta",
    description: "Usuário com acesso apenas à dashboard e histórico.",
    targetRoles: ["user"],
    entries: [
      { permissionKey: "screen:/vendas:view", allowed: false },
      { permissionKey: "screen:/produtos:view", allowed: false },
      { permissionKey: "screen:/precos:view", allowed: false },
      { permissionKey: "screen:/relatorio-vendas:view", allowed: false },
      { permissionKey: "screen:/relatorio-encomendas:view", allowed: false },
      { permissionKey: "screen:/rankings:view", allowed: false },
      { permissionKey: "screen:/precos-margens:view", allowed: false },
      { permissionKey: "screen:/marcas:view", allowed: false },
      { permissionKey: "screen:/usuarios-pendentes:view", allowed: false },
      { permissionKey: "screen:/auditoria:view", allowed: false },
      { permissionKey: "screen:/componentes:view", allowed: false },
    ],
  },
] as const;

export function getAllowedRoles(path: ScreenPath): readonly UserRole[] {
  return ROUTE_ACCESS[path] ?? ADMIN_ONLY;
}

export function screenPermissionKey(path: ScreenPath) {
  return `screen:${path}:view`;
}

export function parseScreenPathFromPermissionKey(permissionKey: string): ScreenPath | null {
  const match = permissionKey.match(/^screen:(.+):view$/);
  if (!match) return null;
  const path = match[1];
  return (SCREEN_CATALOG.some((screen) => screen.path === path) ? path : null) as ScreenPath | null;
}

export function roleCanAccessPath(role: string | undefined, path: ScreenPath) {
  if (!role) return false;
  return getAllowedRoles(path).includes(role as UserRole);
}

export function roleCanPerformAction(role: string | undefined, permissionKey: ActionPermissionKey) {
  if (!role) return false;
  const roleKey = role as UserRole;
  return ROLE_ACTION_ACCESS[roleKey]?.includes(permissionKey) ?? false;
}
