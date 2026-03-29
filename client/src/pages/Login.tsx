import { useAuth } from "@/features/auth/hooks/useAuth";
import { API_BASE_URL } from "@/const";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Clock3, Eye, EyeOff, Loader2, Lock, Mail, PackageOpen, Shield, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type GoogleStatus =
  | null
  | "pending"
  | "rejected"
  | "not_configured"
  | "cancelled"
  | "invalid_state"
  | "invalid_client"
  | "error";

export default function Login() {
  const { login, logout, loading, user } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>(null);
  const [retryIn, setRetryIn] = useState(30);
  const searchParams = new URLSearchParams(window.location.search);
  const redirectAfterLogin = searchParams.get("next") || "/";
  const forceSwitch = searchParams.get("switch") === "1";

  useEffect(() => {
    if (user && !forceSwitch) {
      setLocation("/");
    }
  }, [user, forceSwitch, setLocation]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleParam = params.get("google") as GoogleStatus | null;
    if (!googleParam) return;
    setGoogleStatus(googleParam);

    if (googleParam === "cancelled") {
      toast.warning("Login Google cancelado.");
    } else if (googleParam && googleParam !== "pending") {
      toast.error("Falha no login Google. Tente novamente.");
    }

    params.delete("google");
    const next = params.toString();
    window.history.replaceState(null, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
  }, []);

  useEffect(() => {
    if (googleStatus !== "pending") return;
    setRetryIn(30);
    const timer = window.setInterval(() => {
      setRetryIn((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          handleGoogleLogin();
          return 30;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [googleStatus]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      toast.error("Preencha email e senha.");
      return;
    }

    setIsSubmitting(true);
    let result: Awaited<ReturnType<typeof login>>;
    try {
      result = await login(email, password);
    } finally {
      setIsSubmitting(false);
    }

    if (!result?.success) {
      toast.error("Email ou senha inválidos.");
      return;
    }

    toast.success("Login realizado com sucesso.");
    setLocation(redirectAfterLogin);
  };

  const handleGoogleLogin = () => {
    window.location.assign(`${API_BASE_URL}/auth/google/start`);
  };

  const fillDemo = (type: "admin" | "gerente" | "user") => {
    if (type === "admin") {
      setEmail("admin@pioneira.local");
      setPassword("admin123");
      return;
    }
    if (type === "gerente") {
      setEmail("gerente@pioneira.local");
      setPassword("gerente123");
      return;
    }
    setEmail("usuario@pioneira.local");
    setPassword("user123");
  };

  const handleSwitchAccount = async () => {
    try {
      await logout();
      toast.success("Sessão encerrada. Faça login com outra conta.");
    } catch {
      toast.error("Não foi possível encerrar a sessão atual.");
    }
  };

  if (googleStatus === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white p-6">
        <Card className="w-full max-w-xl border-0 shadow-2xl bg-white">
          <div className="p-8 space-y-6 text-center">
            <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <Clock3 className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900">Aguardando aprovação do administrador</h1>
              <p className="text-slate-600">
                Seu cadastro via Google foi recebido. Assim que o admin aprovar, você poderá entrar.
              </p>
            </div>

            <div className="rounded-xl border bg-slate-50 p-5">
              <div className="flex items-center justify-center gap-3 text-slate-700">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="font-medium">Verificando liberação...</span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Nova tentativa automática em <span className="font-semibold text-slate-700">{retryIn}s</span>.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button onClick={handleGoogleLogin} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Tentar login Google novamente
              </Button>
              <Button variant="outline" onClick={() => {
                setGoogleStatus(null);
                window.history.replaceState(null, "", `${window.location.pathname}?switch=1`);
              }}>
                Entrar com usuário admin
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const googleErrorMessage: Record<Exclude<GoogleStatus, null | "pending">, string> = {
    rejected: "Seu acesso foi recusado pelo administrador.",
    not_configured: "Login Google não está configurado no servidor.",
    cancelled: "Login Google cancelado antes da conclusão.",
    invalid_state: "Falha de segurança na autenticação Google. Tente novamente.",
    invalid_client: "Falha de configuração OAuth (Client Secret/Client ID inválido).",
    error: "Não foi possível concluir o login Google no momento.",
  };

  return (
    <div className="min-h-screen flex overflow-hidden">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')]" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl border border-white/30">
              <PackageOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-xl">Pioneira Estoque</h2>
              <p className="text-xs text-white/80">Sistema Corporativo</p>
            </div>
          </div>

          <div className="space-y-6 max-w-lg">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Gestão Inteligente de Estoque</span>
            </div>
            <h1 className="text-5xl font-bold leading-tight">Controle total do seu inventário</h1>
            <p className="text-lg text-white/90">
              Gerencie produtos, vendas e operação diária com velocidade e confiança.
            </p>

            <div className="grid grid-cols-2 gap-4 pt-6">
              <div className="space-y-2">
                <div className="flex items-center justify-center w-12 h-12 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="font-semibold">Seguro e Confiável</h3>
                <p className="text-sm text-white/80">Autenticação corporativa</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-center w-12 h-12 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                  <PackageOpen className="w-6 h-6" />
                </div>
                <h3 className="font-semibold">Gestão Completa</h3>
                <p className="text-sm text-white/80">Fluxo unificado do estoque</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8 text-sm">
            <div>
              <div className="font-bold text-2xl">500+</div>
              <div className="text-white/80">Produtos</div>
            </div>
            <div>
              <div className="font-bold text-2xl">99.9%</div>
              <div className="text-white/80">Disponibilidade</div>
            </div>
            <div>
              <div className="font-bold text-2xl">24/7</div>
              <div className="text-white/80">Operação</div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gradient-to-br from-slate-50 to-white">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-2xl mb-4 shadow-xl">
              <PackageOpen className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-bold text-2xl text-slate-900">Pioneira Estoque</h1>
            <p className="text-slate-600 text-sm">Sistema de Gestão</p>
          </div>

          <Card className="border-0 shadow-2xl bg-white/85 backdrop-blur-sm">
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <h2 className="text-3xl font-bold text-slate-900">Bem-vindo!</h2>
                <p className="text-slate-600">Entre com suas credenciais para continuar</p>
              </div>

              {user && forceSwitch ? (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Você já está autenticado</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>
                      Sessão atual: <strong>{user.email ?? user.openId}</strong> ({user.role})
                    </p>
                    <Button type="button" variant="outline" onClick={handleSwitchAccount}>
                      Sair e entrar com outra conta
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {googleStatus ? (
                <Alert variant="destructive" className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Falha no login Google</AlertTitle>
                  <AlertDescription>
                    {googleErrorMessage[googleStatus]}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="button"
                variant="outline"
                className="w-full h-12 border-2 hover:bg-slate-50 transition-all duration-200"
                onClick={handleGoogleLogin}
                disabled={isSubmitting || loading}
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continuar com Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-3 text-slate-500 font-medium">Ou continue com email</span>
                </div>
              </div>

              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-700 font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-11 h-12 border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                      disabled={isSubmitting || loading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-slate-700 font-medium">Senha</Label>
                    <button
                      type="button"
                      onClick={() => toast.info("Recuperação de senha será ativada na próxima fase.")}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                    >
                      Esqueceu?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-11 pr-11 h-12 border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                      disabled={isSubmitting || loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      disabled={isSubmitting || loading}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    id="remember"
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="remember" className="ml-2 text-sm text-slate-600">
                    Manter-me conectado
                  </label>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                  disabled={isSubmitting || loading}
                >
                  {isSubmitting ? "Entrando..." : "Entrar no Sistema"}
                </Button>
              </form>

              <div className="space-y-3 pt-2">
                <div className="text-center text-xs uppercase tracking-wide text-slate-500 font-medium">Acesso demo</div>
                <div className="grid grid-cols-3 gap-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => fillDemo("admin")} disabled={isSubmitting || loading}>
                    Admin
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => fillDemo("gerente")} disabled={isSubmitting || loading}>
                    Gerente
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => fillDemo("user")} disabled={isSubmitting || loading}>
                    Usuário
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
