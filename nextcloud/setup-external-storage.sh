#!/bin/bash
# Wait for Nextcloud to finish installation
until php /var/www/html/occ status --output=json 2>/dev/null | grep -q '"installed":true'; do
  echo "[setup] waiting for Nextcloud to be installed..."
  sleep 5
done

# Enable the external storage app
php /var/www/html/occ app:enable files_external

# Allow local mounts
php /var/www/html/occ config:system:set files_external_allow_create_new_local --value=true

# Configure proxy overrides for Cloudflare Tunnel (if domain is set)
if [ -n "${NEXTCLOUD_DOMAIN:-}" ]; then
  php /var/www/html/occ config:system:set overwriteprotocol --value=https
  php /var/www/html/occ config:system:set overwritehost --value="$NEXTCLOUD_DOMAIN"
  php /var/www/html/occ config:system:set overwrite.cli.url --value="https://$NEXTCLOUD_DOMAIN"
  echo "[setup] proxy overrides configured for $NEXTCLOUD_DOMAIN"
fi

# Check if the mount already exists
EXISTING=$(php /var/www/html/occ files_external:list --output=json 2>/dev/null)
if echo "$EXISTING" | grep -q "recordings"; then
  echo "[setup] external storage for /recordings already configured"
else
  # Create the external storage mount
  MOUNT_ID=$(php /var/www/html/occ files_external:create \
    "Recordings" local null::null \
    --config datadir=/recordings \
    --output=json 2>/dev/null | grep -o '"mount_id":[0-9]*' | grep -o '[0-9]*')

  if [ -z "$MOUNT_ID" ]; then
    # Fallback: try parsing differently
    MOUNT_ID=$(php /var/www/html/occ files_external:create \
      "Recordings" local null::null \
      --config datadir=/recordings 2>/dev/null | grep -o '[0-9]*')
  fi

  if [ -n "$MOUNT_ID" ]; then
    # Make it available to all users
    php /var/www/html/occ files_external:applicable --add-user=all "$MOUNT_ID" 2>/dev/null || true
    echo "[setup] external storage configured (mount_id=$MOUNT_ID)"
  else
    echo "[setup] external storage mount created"
  fi
fi
