#!/usr/bin/env bash
# Installs/updates the Robo Arena static site on an Ubuntu/Debian server.
# Expects the site files to have been uploaded to /tmp/ra-upload (see deploy.ps1).
set -euo pipefail

SITE_DIR=/var/www/robot-arena
UPLOAD_DIR=/tmp/ra-upload
CONF=/etc/nginx/sites-available/robot-arena

if ! command -v nginx >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y nginx
fi

cat > "$CONF" <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root /var/www/robot-arena;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript text/javascript image/svg+xml;
    gzip_min_length 1024;

    add_header X-Content-Type-Options nosniff always;

    location / {
        try_files $uri $uri/ =404;
    }

    # Revalidate on every load so redeploys show up immediately.
    location ~* \.(html|js|css)$ {
        add_header Cache-Control "no-cache";
        add_header X-Content-Type-Options nosniff always;
    }
}
NGINX

ln -sf "$CONF" /etc/nginx/sites-enabled/robot-arena
rm -f /etc/nginx/sites-enabled/default

if [ -d "$UPLOAD_DIR" ]; then
  if [ -d "$SITE_DIR" ]; then
    BACKUP="$SITE_DIR.bak-$(date +%Y%m%d-%H%M%S)"
    mv "$SITE_DIR" "$BACKUP"
    echo "Previous site backed up to $BACKUP"
  fi
  mv "$UPLOAD_DIR" "$SITE_DIR"
  chown -R www-data:www-data "$SITE_DIR"
  find "$SITE_DIR" -type d -exec chmod 755 {} +
  find "$SITE_DIR" -type f -exec chmod 644 {} +
fi

nginx -t
systemctl enable --now nginx >/dev/null 2>&1 || true
systemctl reload nginx

# Open HTTP if ufw is active.
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null
fi

echo "Deployed. Files:"
ls -la "$SITE_DIR"
