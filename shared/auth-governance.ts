export const AUTH_ACTION_PREFIX = "auth.";

export const AUTH_AUDIT_ACTION = {
  LOGIN_SUCCESS: "auth.login_success",
  LOGIN_FAILED: "auth.login_failed",
  LOGIN_BLOCKED: "auth.login_blocked",
  LOGOUT: "auth.logout",
  LOGOUT_ALL: "auth.logout_all",
  APPROVE_USER: "auth.approve_user",
  REJECT_USER: "auth.reject_user",
  PROMOTE_USER_ADMIN: "auth.promote_user_admin",
  INACTIVATE_USER_TO_PENDING: "auth.inactivate_user_to_pending",
  UPDATE_USER_PERMISSIONS: "auth.update_user_permissions",
  RATE_LIMIT_CLEAR: "auth.rate_limit_clear",
} as const;

export type AuthAuditAction = (typeof AUTH_AUDIT_ACTION)[keyof typeof AUTH_AUDIT_ACTION];

export const AUTH_AUDIT_LABEL: Record<AuthAuditAction, string> = {
  [AUTH_AUDIT_ACTION.LOGIN_SUCCESS]: "Login realizado",
  [AUTH_AUDIT_ACTION.LOGIN_FAILED]: "Tentativa de login inválida",
  [AUTH_AUDIT_ACTION.LOGIN_BLOCKED]: "Login bloqueado por tentativas",
  [AUTH_AUDIT_ACTION.LOGOUT]: "Logout",
  [AUTH_AUDIT_ACTION.LOGOUT_ALL]: "Encerramento global de sessões",
  [AUTH_AUDIT_ACTION.APPROVE_USER]: "Usuário aprovado",
  [AUTH_AUDIT_ACTION.REJECT_USER]: "Usuário rejeitado",
  [AUTH_AUDIT_ACTION.PROMOTE_USER_ADMIN]: "Usuário promovido para admin",
  [AUTH_AUDIT_ACTION.INACTIVATE_USER_TO_PENDING]: "Usuário inativado (pendente)",
  [AUTH_AUDIT_ACTION.UPDATE_USER_PERMISSIONS]: "Permissões de usuário atualizadas",
  [AUTH_AUDIT_ACTION.RATE_LIMIT_CLEAR]: "Mitigação de rate-limit",
};

export const AUTH_RATE_LIMIT_SCOPE = {
  LOGIN: "auth.login",
  APPROVE_USER: "auth.approve_user",
  PROMOTE_USER_ADMIN: "auth.promote_user_admin",
  INACTIVATE_USER_PENDING: "auth.inactivate_user_pending",
  REJECT_USER: "auth.reject_user",
  UPDATE_USER_PERMISSIONS: "auth.update_user_permissions",
  AUDIT_EXPORT_CSV: "auth.audit_export_csv",
  RATE_LIMIT_CLEAR: "auth.rate_limit_clear",
} as const;

export const AUTH_LOGIN_AUDIT_ACTIONS = [
  AUTH_AUDIT_ACTION.LOGIN_SUCCESS,
  AUTH_AUDIT_ACTION.LOGIN_FAILED,
  AUTH_AUDIT_ACTION.LOGIN_BLOCKED,
] as const;
