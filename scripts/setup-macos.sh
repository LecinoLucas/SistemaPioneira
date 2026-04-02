#!/usr/bin/env bash

set -euo pipefail

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew não encontrado. Instale primeiro em https://brew.sh"
  exit 1
fi

echo "==> Atualizando Homebrew"
brew update

echo "==> Instalando dependências do sistema"
brew install node pnpm mysql poppler

echo "==> Versões instaladas"
node -v
pnpm -v
mysql --version
pdftotext -v | head -n 1

echo
echo "Bootstrap do macOS concluído."
echo "Próximos passos:"
echo "1. cp .env.example .env"
echo "2. pnpm install"
echo "3. pnpm run db:push"
echo "4. pnpm run dev"
