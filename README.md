# Estoque Manager

Sistema web para controle de estoque, vendas, encomendas e relatórios da operação comercial.

## Arquitetura (separada)

- **Frontend**: React + Vite (diretório `client/`), roda em `http://localhost:5173`
- **Backend**: Express + tRPC + Drizzle (diretório `server/`), roda em `http://localhost:3001`
- **Banco**: MySQL

Frontend e backend agora executam de forma **independente**, sem runtime/OAuth do Manus.

## Estrutura

```text
estoque-manager/
├── client/                # Frontend React
├── server/                # Backend API (Express + tRPC)
│   └── modules/           # Arquitetura em camadas por contexto de negócio
│       ├── auth/          # Login/sessão/autorização
│       ├── users/         # Entidade e persistência de usuário
│       ├── approvals/     # Aprovação/promoção/inativação
│       └── audit/         # Auditoria/rate-limit/anomalias
├── drizzle/               # Schema e migrations do banco
├── scripts/
│   ├── data/              # Seeds/importadores auxiliares
│   └── sql/               # Scripts SQL operacionais
├── shared/                # Constantes e tipos compartilhados
└── package.json           # Scripts da stack
```

Para manter o projeto simples no dia a dia, o workspace usa filtros no VS Code para esconder pastas geradas (cache/log/build), deixando foco em:
- `client/`
- `server/`
- `shared/`
- `drizzle/`
- `docs/`

Detalhes da arquitetura em camadas:
- [Arquitetura em Camadas e Módulos](/Users/lecinolucas/Desktop/projetos/estoque-manager/docs/ARCHITECTURE.md)

## Pré-requisitos

- Node.js 18+
- pnpm
- MySQL 8+

## Configuração

Crie o arquivo `.env` na raiz:

```env
DATABASE_URL=mysql://root:@localhost:3306/estoque_manager
JWT_SECRET=change-me
FRONTEND_URL=http://localhost:5173,http://localhost:5174

# Segurança de cookie (produção)
# SESSION_COOKIE_DOMAIN=.seudominio.com
# SESSION_COOKIE_SAME_SITE=lax

# CORS extra (opcional, separado por vírgula)
# CORS_ALLOWED_HEADERS=X-User-OpenId
```

Você também pode partir de um template seguro:

```bash
cp .env.example .env
```

No frontend, opcionalmente defina:

```env
VITE_API_BASE_URL=http://localhost:3001
```

Se não definir, o frontend usa `http://localhost:3001` por padrão.

Validações automáticas:
- Em produção, o backend exige `DATABASE_URL`, `JWT_SECRET` forte e `FRONTEND_URL`.
- No OAuth Google, `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` devem estar definidos juntos.

Auditoria (opcional):
- `AUDIT_MAX_SIZE_MB`: tamanho máximo do arquivo ativo de auditoria antes de rotacionar (padrão: `5`)
- `AUDIT_RETENTION_DAYS`: retenção dos arquivos rotacionados de auditoria (padrão: `30`)

## Instalação

```bash
pnpm install
```

## Banco de dados

```bash
pnpm run db:push
```

Importação auxiliar (Queen):

```bash
pnpm run seed:queen
# ou via SQL:
pnpm run sql:queen:insert
pnpm run sql:queen:update-brands
```

## Como rodar

### Rodar backend + frontend juntos

```bash
pnpm run dev
```

### Rodar separado

```bash
# Terminal 1
pnpm run dev:backend

# Terminal 2
pnpm run dev:frontend
```

## Build e execução

```bash
pnpm run build
pnpm run start:backend
pnpm run start:frontend
```

## Endpoints

- API health: `GET http://localhost:3001/api/health`
- tRPC: `http://localhost:3001/api/trpc`

## Rate Limit e Observabilidade

As rotas sensíveis possuem limitação de taxa no backend e retornam:

- `X-RateLimit-Limit`: limite da janela atual
- `X-RateLimit-Remaining`: requisições restantes
- `X-RateLimit-Reset`: segundos para reset do contador
- `Retry-After`: segundos para nova tentativa (quando retorna `429`)

No painel de auditoria (admin), existe mitigação operacional para limpar buckets de rate-limit por filtro de escopo/identidade, com trilha em auditoria (`auth.rate_limit_clear`).

## Testes e qualidade

```bash
pnpm run check
pnpm run test
```

## Autenticação e Governança

- Login local por email/senha (desenvolvimento).
- Login Google com fluxo de aprovação administrativa.
- Usuário novo via Google entra como `pendente` até aprovação do `admin`.
- Sessão segura em cookie `httpOnly` com rotação e expiração absoluta.
- Trilha de auditoria de eventos críticos em `.dev-logs/audit.log`.
- Rotação automática de auditoria por tamanho e retenção automática de arquivos antigos.

### Matriz de Acesso por Perfil

- `user`: `/`, `/vendas`, `/historico`
- `gerente`: `user` + `/produtos`, `/precos`, `/relatorio-vendas`, `/relatorio-encomendas`, `/rankings`
- `admin`: acesso total + governança (`/precos-margens`, `/marcas`, `/usuarios-pendentes`, `/auditoria`, `/componentes`)

Procedimentos formais:
- [Governança e Procedimentos](/Users/lecinolucas/Desktop/projetos/estoque-manager/docs/GOVERNANCA_E_PROCEDIMENTOS.md)
- [Backlog Técnico](/Users/lecinolucas/Desktop/projetos/estoque-manager/docs/TODO.md)

## Licença

MIT
