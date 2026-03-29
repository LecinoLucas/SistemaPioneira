import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAccessControl } from "@/features/auth/hooks/useAccessControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  ACTION_PERMISSION_CATALOG,
  PERMISSION_TEMPLATES,
  SCREEN_CATALOG,
  roleCanAccessPath,
  roleCanPerformAction,
  screenPermissionKey,
  type ActionPermissionKey,
  type PermissionEntry,
  type ScreenPath,
} from "@shared/access-governance";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type PermissionGroup = "Operação" | "Catálogo" | "Relatórios" | "Administração";

const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  "Operação",
  "Catálogo",
  "Relatórios",
  "Administração",
];

export default function PendingUsers() {
  const { user: currentUser } = useAuth();
  const { canPerform, isPermissionsProcedureMissing } = useAccessControl();
  const canApproveUsers = canPerform("action:users.approve");
  const canPromoteUsers = canPerform("action:users.promote");
  const canEditPermissions = canPerform("action:users.permissions");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [permissionSearch, setPermissionSearch] = useState("");
  const [permissionGroupFilter, setPermissionGroupFilter] = useState<"all" | PermissionGroup>("all");
  const [permissionTypeFilter, setPermissionTypeFilter] = useState<"all" | "screen" | "action">("all");
  const [permissionStatusFilter, setPermissionStatusFilter] = useState<"all" | "allowed" | "blocked" | "restricted_profile">("all");
  const [draftPermissionMap, setDraftPermissionMap] = useState<Map<string, boolean>>(new Map());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("custom");

  const pendingQuery = trpc.auth.pendingUsers.useQuery();
  const usersQuery = trpc.auth.usersAdminList.useQuery();
  const userPermissionsQuery = trpc.auth.userPermissions.useQuery(
    { userId: selectedUserId ?? -1 },
    {
      enabled: selectedUserId != null && canEditPermissions && !isPermissionsProcedureMissing,
      staleTime: 10_000,
      retry: false,
    }
  );
  const isUserPermissionsProcedureMissing = String(userPermissionsQuery.error?.message ?? "").includes(
    'No procedure found on path "auth.userPermissions"'
  );
  const utils = trpc.useUtils();

  const approveMutation = trpc.auth.approveUser.useMutation({
    onSuccess: async () => {
      toast.success("Usuário aprovado com sucesso.");
      await utils.auth.pendingUsers.invalidate();
      await utils.auth.usersAdminList.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Falha ao aprovar usuário.");
    },
  });

  const rejectMutation = trpc.auth.rejectUser.useMutation({
    onSuccess: async () => {
      toast.success("Usuário recusado com sucesso.");
      await utils.auth.pendingUsers.invalidate();
      await utils.auth.usersAdminList.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Falha ao recusar usuário.");
    },
  });

  const promoteMutation = trpc.auth.promoteUserToAdmin.useMutation({
    onSuccess: async (data) => {
      if (data.alreadyAdmin) {
        toast.info("Usuário já era administrador.");
      } else {
        toast.success("Usuário promovido para administrador.");
      }
      await utils.auth.usersAdminList.invalidate();
      await utils.auth.pendingUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Falha ao promover usuário.");
    },
  });

  const inactivateMutation = trpc.auth.inactivateUserToPending.useMutation({
    onSuccess: async () => {
      toast.success("Usuário inativado e retornado para pendente.");
      await utils.auth.usersAdminList.invalidate();
      await utils.auth.pendingUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Falha ao inativar usuário.");
    },
  });

  const setPermissionsMutation = trpc.auth.setUserPermissions.useMutation({
    onSuccess: async (data) => {
      toast.success(`Permissões atualizadas (${data.totalPermissions}).`);
      if (selectedUserId != null) {
        await utils.auth.userPermissions.invalidate({ userId: selectedUserId });
      }
    },
    onError: (error) => {
      toast.error(error.message || "Falha ao atualizar permissões.");
    },
  });

  const isBusy =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    promoteMutation.isPending ||
    inactivateMutation.isPending ||
    setPermissionsMutation.isPending;

  const selectedUser = useMemo(
    () => usersQuery.data?.find((item) => item.id === selectedUserId) ?? null,
    [usersQuery.data, selectedUserId]
  );

  useEffect(() => {
    if (!userPermissionsQuery.data) return;
    const next = new Map<string, boolean>();
    for (const entry of userPermissionsQuery.data as PermissionEntry[]) {
      next.set(entry.permissionKey, entry.allowed);
    }
    setDraftPermissionMap(next);
    setSelectedTemplateId("custom");
  }, [userPermissionsQuery.data]);

  const availableTemplates = useMemo(() => {
    if (!selectedUser) return [];
    return PERMISSION_TEMPLATES.filter((template) => template.targetRoles.includes(selectedUser.role));
  }, [selectedUser]);
  const selectedTemplate = useMemo(
    () => availableTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [availableTemplates, selectedTemplateId]
  );

  const permissionDefinitions = useMemo(() => {
    const screenDefs = SCREEN_CATALOG.map((screen) => ({
      key: screenPermissionKey(screen.path),
      label: `Tela: ${screen.label}`,
      group: screen.group,
      type: "screen" as const,
      baselineAllowed: roleCanAccessPath(selectedUser?.role, screen.path),
    }));
    const actionDefs = ACTION_PERMISSION_CATALOG.map((action) => ({
      key: action.key,
      label: `Ação: ${action.label}`,
      group: action.group,
      type: "action" as const,
      baselineAllowed: roleCanPerformAction(selectedUser?.role, action.key as ActionPermissionKey),
    }));
    return [...screenDefs, ...actionDefs];
  }, [selectedUser?.role]);

  const filteredDefinitions = useMemo(() => {
    const query = permissionSearch.trim().toLowerCase();
    return permissionDefinitions.filter((definition) => {
      const explicit = draftPermissionMap.get(definition.key);
      const effectiveAllowed = explicit ?? definition.baselineAllowed;
      const status = !definition.baselineAllowed
        ? "restricted_profile"
        : effectiveAllowed
          ? "allowed"
          : "blocked";

      if (permissionGroupFilter !== "all" && definition.group !== permissionGroupFilter) return false;
      if (permissionTypeFilter !== "all" && definition.type !== permissionTypeFilter) return false;
      if (permissionStatusFilter !== "all" && status !== permissionStatusFilter) return false;
      if (!query) return true;

      return (
        definition.label.toLowerCase().includes(query) ||
        definition.key.toLowerCase().includes(query) ||
        definition.group.toLowerCase().includes(query)
      );
    });
  }, [
    draftPermissionMap,
    permissionDefinitions,
    permissionGroupFilter,
    permissionSearch,
    permissionStatusFilter,
    permissionTypeFilter,
  ]);

  const changedPermissions = useMemo(() => {
    if (!selectedUser) return [];
    const entries: PermissionEntry[] = [];
    for (const definition of permissionDefinitions) {
      const baseline = definition.baselineAllowed;
      const explicit = draftPermissionMap.get(definition.key);
      if (explicit === undefined || explicit === baseline) continue;
      entries.push({
        permissionKey: definition.key,
        allowed: explicit,
      });
    }
    return entries;
  }, [draftPermissionMap, permissionDefinitions, selectedUser]);

  const groupSummaries = useMemo(() => {
    return PERMISSION_GROUPS.map((group) => {
      const items = permissionDefinitions.filter((definition) => definition.group === group);
      let allowed = 0;
      let blocked = 0;
      let restricted = 0;
      let customized = 0;

      for (const definition of items) {
        const explicit = draftPermissionMap.get(definition.key);
        const effectiveAllowed = explicit ?? definition.baselineAllowed;
        if (!definition.baselineAllowed) {
          restricted += 1;
        } else if (effectiveAllowed) {
          allowed += 1;
        } else {
          blocked += 1;
        }
        if (explicit !== undefined && explicit !== definition.baselineAllowed) {
          customized += 1;
        }
      }

      return {
        group,
        total: items.length,
        allowed,
        blocked,
        restricted,
        customized,
      };
    });
  }, [draftPermissionMap, permissionDefinitions]);

  const togglePermission = (key: string, baselineAllowed: boolean, nextAllowed: boolean) => {
    setDraftPermissionMap((prev) => {
      const next = new Map(prev);
      if (nextAllowed === baselineAllowed) {
        next.delete(key);
      } else {
        next.set(key, nextAllowed);
      }
      return next;
    });
  };

  const applyBulkFiltered = (mode: "allow" | "block" | "reset") => {
    setDraftPermissionMap((prev) => {
      const next = new Map(prev);
      for (const definition of filteredDefinitions) {
        if (!definition.baselineAllowed) continue;
        if (mode === "allow") {
          next.delete(definition.key);
        } else if (mode === "block") {
          next.set(definition.key, false);
        } else {
          next.delete(definition.key);
        }
      }
      return next;
    });
  };

  const applyBulkByGroup = (group: PermissionGroup, mode: "allow" | "block" | "reset") => {
    setDraftPermissionMap((prev) => {
      const next = new Map(prev);
      for (const definition of permissionDefinitions) {
        if (definition.group !== group) continue;
        if (!definition.baselineAllowed) continue;
        if (mode === "allow" || mode === "reset") {
          next.delete(definition.key);
        } else {
          next.set(definition.key, false);
        }
      }
      return next;
    });
  };

  const applyBulkByType = (type: "screen" | "action", mode: "allow" | "block" | "reset") => {
    setDraftPermissionMap((prev) => {
      const next = new Map(prev);
      for (const definition of permissionDefinitions) {
        if (definition.type !== type) continue;
        if (!definition.baselineAllowed) continue;
        if (mode === "allow" || mode === "reset") {
          next.delete(definition.key);
        } else {
          next.set(definition.key, false);
        }
      }
      return next;
    });
  };

  const statusBadge = (status: "active" | "pending" | "rejected") => {
    if (status === "active") return <Badge variant="default">Ativo</Badge>;
    if (status === "rejected") return <Badge variant="destructive">Rejeitado</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Aprovação de Usuários</h1>
        <p className="text-muted-foreground mt-2">
          Aprove ou recuse usuários novos que entraram pelo Google.
        </p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Usuários Pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingQuery.isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Carregando...</div>
          ) : !pendingQuery.data || pendingQuery.data.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              Nenhum usuário pendente no momento.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingQuery.data.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="font-medium">{user.name || "Usuário sem nome"}</div>
                    <div className="text-sm text-muted-foreground">{user.email || "Sem email"}</div>
                    <div className="mt-2">
                      <Badge variant="secondary">Pendente</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => approveMutation.mutate({ userId: user.id })}
                      disabled={isBusy || !canApproveUsers}
                    >
                      Aprovar
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => rejectMutation.mutate({ userId: user.id })}
                      disabled={isBusy || !canApproveUsers}
                    >
                      Recusar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Gestão de Usuários</CardTitle>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Carregando usuários...</div>
          ) : !usersQuery.data || usersQuery.data.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <div className="space-y-3">
              {usersQuery.data.map((user) => {
                const isSelf = currentUser?.id === user.id;
                const canPromote = user.role !== "admin" && user.status === "active" && !isSelf;
                const canInactivate = !isSelf && user.status !== "pending";
                return (
                  <div
                    key={`managed-${user.id}`}
                    className="flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-medium">{user.name || "Usuário sem nome"}</div>
                      <div className="text-sm text-muted-foreground">{user.email || "Sem email"}</div>
                      <div className="mt-2 flex items-center gap-2">
                        {statusBadge(user.status)}
                        <Badge variant="outline">{user.role}</Badge>
                        {isSelf ? <Badge variant="secondary">Você</Badge> : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => promoteMutation.mutate({ userId: user.id })}
                        disabled={isBusy || !canPromote || !canPromoteUsers}
                      >
                        Promover a Admin
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => inactivateMutation.mutate({ userId: user.id })}
                        disabled={isBusy || !canInactivate || !canPromoteUsers}
                      >
                        Inativar (voltar pendente)
                      </Button>
                      <Button
                        variant={selectedUserId === user.id ? "default" : "outline"}
                        onClick={() => setSelectedUserId((prev) => (prev === user.id ? null : user.id))}
                        disabled={isBusy || !canEditPermissions}
                      >
                        Permissões
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Painel de Permissões por Usuário</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPermissionsProcedureMissing || isUserPermissionsProcedureMissing ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Seu backend ativo não possui as procedures de permissões (`auth.myPermissions`, `auth.userPermissions`).
              Reinicie o backend do projeto para aplicar as rotas mais recentes.
            </div>
          ) : null}
          {!selectedUser ? (
            <div className="py-10 text-center text-muted-foreground">
              Selecione um usuário em "Gestão de Usuários" e clique em <strong>Permissões</strong>.
            </div>
          ) : (
            <>
              <div className="rounded-md border p-3">
                <div className="font-medium">{selectedUser.name || "Usuário sem nome"}</div>
                <div className="text-sm text-muted-foreground">{selectedUser.email || "Sem email"}</div>
                <div className="mt-2 flex items-center gap-2">
                  {statusBadge(selectedUser.status)}
                  <Badge variant="outline">{selectedUser.role}</Badge>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={selectedTemplateId}
                  onChange={(event) => {
                    const templateId = event.target.value;
                    setSelectedTemplateId(templateId);
                    if (templateId === "custom") return;
                    const template = availableTemplates.find((item) => item.id === templateId);
                    if (!template) return;
                    const next = new Map<string, boolean>();
                    for (const entry of template.entries) {
                      next.set(entry.permissionKey, entry.allowed);
                    }
                    setDraftPermissionMap(next);
                    toast.info(`Template aplicado: ${template.label}`);
                  }}
                >
                  <option value="custom">Template: Customizado</option>
                  {availableTemplates.length > 0 ? <option disabled>────────────</option> : null}
                  {availableTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Buscar por tela, ação, grupo ou chave..."
                  value={permissionSearch}
                  onChange={(event) => setPermissionSearch(event.target.value)}
                />
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={permissionGroupFilter}
                  onChange={(event) =>
                    setPermissionGroupFilter(
                      event.target.value as "all" | "Operação" | "Catálogo" | "Relatórios" | "Administração"
                    )
                  }
                >
                  <option value="all">Todos os grupos</option>
                  <option value="Operação">Operação</option>
                  <option value="Catálogo">Catálogo</option>
                  <option value="Relatórios">Relatórios</option>
                  <option value="Administração">Administração</option>
                </select>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={permissionTypeFilter}
                  onChange={(event) =>
                    setPermissionTypeFilter(event.target.value as "all" | "screen" | "action")
                  }
                >
                  <option value="all">Todos os tipos</option>
                  <option value="screen">Telas</option>
                  <option value="action">Ações</option>
                </select>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={permissionStatusFilter}
                  onChange={(event) =>
                    setPermissionStatusFilter(
                      event.target.value as "all" | "allowed" | "blocked" | "restricted_profile"
                    )
                  }
                >
                  <option value="all">Todos os status</option>
                  <option value="allowed">Permitidas</option>
                  <option value="blocked">Bloqueadas por regra individual</option>
                  <option value="restricted_profile">Bloqueadas pelo perfil</option>
                </select>
              </div>

              {selectedTemplate ? (
                <p className="text-xs text-muted-foreground">
                  Template ativo: <strong>{selectedTemplate.label}</strong> - {selectedTemplate.description}
                </p>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {groupSummaries.map((summary) => (
                  <div key={summary.group} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{summary.group}</div>
                      <Badge variant="outline">{summary.total}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="default">Permitidas: {summary.allowed}</Badge>
                      <Badge variant="destructive">Bloqueadas: {summary.blocked}</Badge>
                      <Badge variant="secondary">Perfil: {summary.restricted}</Badge>
                      <Badge variant="outline">Custom: {summary.customized}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applyBulkByGroup(summary.group, "allow")}
                        disabled={isBusy || summary.total === 0}
                      >
                        Permitir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applyBulkByGroup(summary.group, "block")}
                        disabled={isBusy || summary.total === 0}
                      >
                        Bloquear
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applyBulkByGroup(summary.group, "reset")}
                        disabled={isBusy || summary.total === 0}
                      >
                        Resetar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-md border">
                {userPermissionsQuery.isLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Carregando permissões...</div>
                ) : filteredDefinitions.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    Nenhuma permissão encontrada com os filtros atuais.
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredDefinitions.map((definition) => {
                      const explicit = draftPermissionMap.get(definition.key);
                      const effectiveAllowed = explicit ?? definition.baselineAllowed;
                      const profileRestricted = !definition.baselineAllowed;

                      return (
                        <div key={definition.key} className="flex items-center justify-between gap-4 p-3">
                          <div className="min-w-0">
                            <div className="font-medium">{definition.label}</div>
                            <div className="text-xs text-muted-foreground truncate">{definition.key}</div>
                            <div className="mt-1 flex items-center gap-2">
                              <Badge variant="outline">{definition.group}</Badge>
                              <Badge variant="secondary">
                                {definition.type === "screen" ? "Tela" : "Ação"}
                              </Badge>
                              {profileRestricted ? (
                                <Badge variant="destructive">Bloqueada pelo perfil</Badge>
                              ) : explicit === false ? (
                                <Badge variant="destructive">Bloqueada individualmente</Badge>
                              ) : (
                                <Badge variant="default">Permitida</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {effectiveAllowed ? "Permitida" : "Bloqueada"}
                            </span>
                            <Switch
                              checked={effectiveAllowed}
                              disabled={isBusy || profileRestricted}
                              onCheckedChange={(checked) =>
                                togglePermission(definition.key, definition.baselineAllowed, checked)
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => applyBulkByType("screen", "allow")}
                  disabled={isBusy || permissionDefinitions.length === 0}
                >
                  Permitir todas telas
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyBulkByType("screen", "block")}
                  disabled={isBusy || permissionDefinitions.length === 0}
                >
                  Bloquear todas telas
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyBulkByType("action", "allow")}
                  disabled={isBusy || permissionDefinitions.length === 0}
                >
                  Permitir todas ações
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyBulkByType("action", "block")}
                  disabled={isBusy || permissionDefinitions.length === 0}
                >
                  Bloquear todas ações
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyBulkFiltered("allow")}
                  disabled={isBusy || filteredDefinitions.length === 0}
                >
                  Permitir todas filtradas
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyBulkFiltered("block")}
                  disabled={isBusy || filteredDefinitions.length === 0}
                >
                  Bloquear todas filtradas
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyBulkFiltered("reset")}
                  disabled={isBusy || filteredDefinitions.length === 0}
                >
                  Resetar filtradas (perfil)
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Alterações pendentes: <strong>{changedPermissions.length}</strong>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDraftPermissionMap(new Map());
                      setSelectedTemplateId("custom");
                    }}
                    disabled={isBusy}
                  >
                    Limpar customizações
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const next = new Map<string, boolean>();
                      for (const entry of userPermissionsQuery.data ?? []) {
                        next.set(entry.permissionKey, entry.allowed);
                      }
                      setDraftPermissionMap(next);
                      setSelectedTemplateId("custom");
                    }}
                    disabled={isBusy}
                  >
                    Reverter
                  </Button>
                  <Button
                    onClick={() =>
                      setPermissionsMutation.mutate({
                        userId: selectedUser.id,
                        permissions: changedPermissions,
                      })
                    }
                    disabled={isBusy || changedPermissions.length === 0 || !canEditPermissions}
                  >
                    Salvar permissões
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
