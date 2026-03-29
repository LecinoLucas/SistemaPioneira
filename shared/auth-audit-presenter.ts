import { AUTH_AUDIT_ACTION } from "./auth-governance";
import { ACTION_PERMISSION_CATALOG, parseScreenPathFromPermissionKey, SCREEN_CATALOG } from "./access-governance";

type AuditEventLike = {
  action: string;
  metadata?: Record<string, unknown> | null;
  target?: Record<string, unknown> | null;
};

function permissionLabel(permissionKey: string) {
  const action = ACTION_PERMISSION_CATALOG.find((item) => item.key === permissionKey);
  if (action) return `Ação: ${action.label}`;

  const screenPath = parseScreenPathFromPermissionKey(permissionKey);
  if (screenPath) {
    const screen = SCREEN_CATALOG.find((item) => item.path === screenPath);
    if (screen) return `Tela: ${screen.label}`;
  }

  return permissionKey;
}

export function buildAuthAuditSummary(event: AuditEventLike, actorLabel: string) {
  if (event.action === AUTH_AUDIT_ACTION.APPROVE_USER) {
    return `O administrador ${actorLabel} aprovou um usuário pendente.`;
  }
  if (event.action === AUTH_AUDIT_ACTION.REJECT_USER) {
    return `O administrador ${actorLabel} rejeitou um usuário pendente.`;
  }
  if (event.action === AUTH_AUDIT_ACTION.RATE_LIMIT_CLEAR) {
    const removed = Number(event.metadata?.removed ?? 0);
    return `Foi executada uma mitigação operacional, removendo ${removed} bucket(s) de rate-limit.`;
  }
  if (event.action === AUTH_AUDIT_ACTION.PROMOTE_USER_ADMIN) {
    return `O administrador ${actorLabel} promoveu um usuário para perfil admin.`;
  }
  if (event.action === AUTH_AUDIT_ACTION.INACTIVATE_USER_TO_PENDING) {
    return `O administrador ${actorLabel} inativou o usuário, retornando para status pendente.`;
  }
  if (event.action === AUTH_AUDIT_ACTION.UPDATE_USER_PERMISSIONS) {
    const changedCount = Number(event.metadata?.changedCount ?? 0);
    const targetEmail = String(event.target?.targetEmail ?? event.target?.email ?? "");
    const rawChanged = Array.isArray(event.metadata?.changedPermissions)
      ? (event.metadata?.changedPermissions as Array<Record<string, unknown>>)
      : [];
    const topChanged = rawChanged
      .slice(0, 3)
      .map((item) => String(item.permissionKey ?? ""))
      .filter(Boolean)
      .map(permissionLabel);

    const targetText = targetEmail ? ` para ${targetEmail}` : "";
    if (changedCount <= 0) {
      return `O administrador ${actorLabel} revisou permissões${targetText}, sem alterações efetivas.`;
    }
    if (topChanged.length > 0) {
      const suffix = changedCount > topChanged.length ? " e outras permissões" : "";
      return `O administrador ${actorLabel} alterou ${changedCount} permissão(ões)${targetText}: ${topChanged.join(", ")}${suffix}.`;
    }
    return `O administrador ${actorLabel} alterou ${changedCount} permissão(ões)${targetText}.`;
  }
  if (event.action === AUTH_AUDIT_ACTION.LOGIN_SUCCESS) {
    return `Usuário ${actorLabel} autenticado com sucesso.`;
  }
  if (event.action === AUTH_AUDIT_ACTION.LOGIN_FAILED) {
    return "Houve falha de autenticação para o usuário informado.";
  }
  if (event.action === AUTH_AUDIT_ACTION.LOGIN_BLOCKED) {
    return "A origem foi bloqueada temporariamente por excesso de tentativas de login.";
  }

  return null;
}
