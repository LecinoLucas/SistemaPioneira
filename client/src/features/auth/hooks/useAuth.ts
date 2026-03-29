import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

type LoginResult = {
  success: boolean;
  error?: string;
};

/**
 * Hook de autenticação da camada feature/auth.
 * Encapsula interação com API e estado de sessão para UI.
 */
export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/" } = options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    staleTime: 0,
    retry: (failureCount, error) => {
      if (failureCount >= 1) return false;
      if (error instanceof TRPCClientError) {
        const code = error.data?.code;
        if (code === "UNAUTHORIZED" || code === "FORBIDDEN") return false;
        if (error.message?.toLowerCase().includes("failed to fetch")) return true;
      }
      return false;
    },
    retryDelay: 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });
  const loginMutation = trpc.auth.login.useMutation();

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        await loginMutation.mutateAsync({ email: email.trim(), password });
        await utils.auth.me.invalidate();
        return { success: true };
      } catch (error: unknown) {
        if (error instanceof TRPCClientError) {
          return { success: false, error: error.message || "Credenciais inválidas" };
        }
        return { success: false, error: "Falha ao autenticar" };
      }
    },
    [loginMutation, utils]
  );

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    const currentUser = meQuery.data;
    return {
      user: currentUser ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(currentUser),
    };
  }, [meQuery.data, meQuery.isLoading, meQuery.error, logoutMutation.isPending, logoutMutation.error]);

  useEffect(() => {
    if (!meQuery.error) return;
    if (!(meQuery.error instanceof TRPCClientError)) return;
    const code = meQuery.error.data?.code;
    const httpStatus = meQuery.error.data?.httpStatus;
    if (code === "UNAUTHORIZED" || code === "FORBIDDEN" || httpStatus === 401 || httpStatus === 403) {
      utils.auth.me.setData(undefined, null);
    }
  }, [meQuery.error, utils]);

  useEffect(() => {
    if (!redirectOnUnauthenticated || state.loading) return;
    if (!state.isAuthenticated) {
      window.location.href = redirectPath;
    }
  }, [redirectOnUnauthenticated, redirectPath, state.isAuthenticated, state.loading]);

  return {
    ...state,
    login,
    logout,
  };
}
