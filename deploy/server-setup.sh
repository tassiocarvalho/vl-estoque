#!/usr/bin/env bash
# Prepara um servidor Ubuntu (ex.: Oracle Cloud "Always Free") para rodar o V&L Estoque.
#
#   sudo DATABASE_URL='postgresql://...neon.tech/neondb?sslmode=require' bash server-setup.sh
#
# Idempotente: pode rodar de novo sem estragar nada. Instala Node.js, Caddy (HTTPS automático)
# e o cliente do PostgreSQL (backups); cria o usuário do sistema, o serviço e o backup diário.
# Variáveis opcionais: DOMAIN (padrão: <ip>.sslip.io), REPO_SSH (repositório no GitHub).
set -euo pipefail

APP_USER=vlestoque
APP_DIR=/opt/vl-estoque
ENV_FILE=/etc/vl-estoque/env
BACKUP_DIR=/var/backups/vl-estoque
REPO_SSH=${REPO_SSH:-git@github.com:tassiocarvalho/vl-estoque.git}
NODE_MAJOR=24

[[ $EUID -eq 0 ]] || { echo "Rode com sudo."; exit 1; }
export DEBIAN_FRONTEND=noninteractive
step() { echo -e "\n▶ $*"; }

# ─── Memória: máquinas de 1 GB precisam de swap para compilar ────────────────
if [[ ! -f /swapfile ]] && (( $(awk '/MemTotal/ {print $2}' /proc/meminfo) < 3000000 )); then
  step "Criando 2 GB de swap"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ─── Pacotes ─────────────────────────────────────────────────────────────────
step "Instalando pacotes"
apt-get update -q
apt-get install -yq ca-certificates curl gnupg git debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

install -d -m 0755 /etc/apt/keyrings
if ! command -v node >/dev/null || [[ $(node -v) != v${NODE_MAJOR}.* ]]; then
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
fi
if [[ ! -f /etc/apt/sources.list.d/caddy-stable.list ]]; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
fi
if [[ ! -f /etc/apt/sources.list.d/pgdg.list ]]; then
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor --yes -o /etc/apt/keyrings/pgdg.gpg
  echo "deb [signed-by=/etc/apt/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" > /etc/apt/sources.list.d/pgdg.list
fi
apt-get update -q
apt-get install -yq nodejs caddy postgresql-client-18

# ─── Firewall: as imagens Ubuntu da Oracle bloqueiam 80/443 por padrão ───────
step "Liberando portas 80 e 443"
for port in 80 443; do
  rule=(-p tcp --dport "$port" -m state --state NEW -j ACCEPT)
  iptables -C INPUT "${rule[@]}" 2>/dev/null && continue
  # Entra antes do REJECT final da Oracle (se existir); senão, no fim da lista.
  reject_line=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')
  if [[ -n $reject_line ]]; then iptables -I INPUT "$reject_line" "${rule[@]}"; else iptables -A INPUT "${rule[@]}"; fi
done
netfilter-persistent save >/dev/null

# ─── Usuário do sistema e chave de leitura do repositório ────────────────────
step "Criando o usuário $APP_USER"
id "$APP_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$APP_USER"
APP_HOME=$(getent passwd "$APP_USER" | cut -d: -f6)
sudo -u "$APP_USER" mkdir -p "$APP_HOME/.ssh"
chmod 700 "$APP_HOME/.ssh"
[[ -f $APP_HOME/.ssh/id_ed25519 ]] || sudo -u "$APP_USER" ssh-keygen -q -t ed25519 -N '' -C 'vl-estoque-servidor' -f "$APP_HOME/.ssh/id_ed25519"
sudo -u "$APP_USER" sh -c "ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null; sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts"
touch "$APP_HOME/.ssh/authorized_keys" && chown "$APP_USER:" "$APP_HOME/.ssh/authorized_keys" && chmod 600 "$APP_HOME/.ssh/authorized_keys"

# O deploy (GitHub Actions) só pode reiniciar o serviço; nada além disso como root.
echo "$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart vl-estoque" > /etc/sudoers.d/vl-estoque
chmod 440 /etc/sudoers.d/vl-estoque

install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR" "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# ─── Configuração (segredos gerados uma única vez) ───────────────────────────
PUBLIC_IP=$(curl -fsS4 https://ifconfig.me || curl -fsS4 https://api.ipify.org)
DOMAIN=${DOMAIN:-${PUBLIC_IP//./-}.sslip.io}

if [[ ! -f $ENV_FILE ]]; then
  step "Gerando a configuração em $ENV_FILE"
  [[ -n ${DATABASE_URL:-} ]] || { echo "Informe DATABASE_URL (string de conexão do Neon)."; exit 1; }
  # Prisma: conexão direta (sem o pooler) e sem channel_binding; tolera o "despertar" do Neon.
  db_url=$(sed -E 's/-pooler\././; s/[&?]channel_binding=[^&]*//' <<<"$DATABASE_URL")
  [[ $db_url == *connect_timeout=* ]] || db_url="${db_url}$([[ $db_url == *\?* ]] && echo '&' || echo '?')connect_timeout=30"
  rand() { openssl rand -base64 "$1" | tr '+/' '-_' | tr -d '=\n'; }
  install -d -m 0750 -o root -g "$APP_USER" /etc/vl-estoque
  umask 027
  # Valores entre aspas simples: lidos tanto pelo systemd quanto pelo bash (a URL tem "&").
  cat > "$ENV_FILE" <<EOF
NODE_ENV='production'
DATABASE_URL='$db_url'
HOST='127.0.0.1'
PORT='3000'
WEB_ORIGIN='https://$DOMAIN'
COOKIE_SECURE='true'
SESSION_HOURS='12'
JWT_SECRET='$(rand 48)'
PDV_API_KEY='$(rand 32)'
INITIAL_ADMIN_PASSWORD='Adm-$(rand 9)'
EOF
  chown root:"$APP_USER" "$ENV_FILE"
  umask 022
fi
DOMAIN=$(sed -nE "s#^WEB_ORIGIN='?https://([^']*)'?#\1#p" "$ENV_FILE")

# ─── Serviços ────────────────────────────────────────────────────────────────
step "Configurando serviços"
cat > /etc/systemd/system/vl-estoque.service <<EOF
[Unit]
Description=V&L Estoque (API + telas)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/apps/api
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/vl-backup.service <<EOF
[Unit]
Description=Backup do banco do V&L Estoque

[Service]
Type=oneshot
User=$APP_USER
EnvironmentFile=$ENV_FILE
Environment=BACKUP_DIR=$BACKUP_DIR
ExecStart=/bin/bash $APP_DIR/deploy/backup.sh
EOF

cat > /etc/systemd/system/vl-backup.timer <<'EOF'
[Unit]
Description=Backup diário do V&L Estoque

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
EOF

systemctl daemon-reload
systemctl enable vl-estoque vl-backup.timer >/dev/null
systemctl start vl-backup.timer
systemctl reload caddy || systemctl restart caddy

# ─── Código ──────────────────────────────────────────────────────────────────
if [[ ! -d $APP_DIR/.git ]]; then
  if sudo -u "$APP_USER" git clone -q "$REPO_SSH" "$APP_DIR"; then
    step "Primeira publicação"
    sudo -u "$APP_USER" bash "$APP_DIR/deploy/deploy.sh"
  else
    echo -e "\n⚠  Não consegui baixar o código. Cadastre esta chave como Deploy key (somente leitura) do repositório e rode o script de novo:\n"
    cat "$APP_HOME/.ssh/id_ed25519.pub"
    exit 2
  fi
fi

echo -e "\n✅ Pronto: https://$DOMAIN"
