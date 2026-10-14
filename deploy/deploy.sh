#!/usr/bin/env bash
# Publica a versão mais recente do GitHub no servidor (rodado pelo GitHub Actions a cada push na main).
set -euo pipefail

APP_DIR=/opt/vl-estoque
cd "$APP_DIR"
set -a; . /etc/vl-estoque/env; set +a

echo "▶ Baixando a versão mais recente"
git fetch -q origin main
git reset -q --hard origin/main
echo "  $(git log -1 --format='%h %s')"

echo "▶ Instalando dependências"
# --ignore-scripts: nada de baixar Electron/PostgreSQL embutido no servidor; o Prisma é gerado abaixo.
npm ci --ignore-scripts --no-audit --no-fund --loglevel=error

echo "▶ Compilando"
NODE_OPTIONS=--max-old-space-size=1536 npm run build

echo "▶ Atualizando o banco"
npx --workspace @vl/api prisma migrate deploy

echo "▶ Reiniciando"
sudo /usr/bin/systemctl restart vl-estoque
for _ in $(seq 1 30); do
  # Qualquer resposta HTTP (mesmo 401 sem login) indica que a API subiu.
  if [[ $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/settings) =~ ^[24] ]]; then
    echo "✅ No ar: $WEB_ORIGIN"
    exit 0
  fi
  sleep 2
done
echo "❌ O sistema não respondeu. Veja: journalctl -u vl-estoque -n 50"
exit 1
