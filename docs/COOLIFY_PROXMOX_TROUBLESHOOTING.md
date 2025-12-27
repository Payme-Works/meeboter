# Coolify on Proxmox LXC Troubleshooting

## Symptoms

- Coolify dashboard returns 502 Bad Gateway
- Bot containers stuck in restart loop with `TRPCClientError: Failed to parse JSON`
- `docker ps` shows only `coolify-redis` running, main `coolify` container missing

## Root Cause

The `docker-compose.yml` at `/data/coolify/source/` becomes corrupted, losing:
- `image:` definitions for services
- Port mappings
- Volume configurations

## Quick Fix

### 1. SSH into the Coolify Proxmox container

### 2. Recreate docker-compose.yml

```bash
cd /data/coolify/source

cat > docker-compose.yml << 'EOF'
services:
    coolify:
        container_name: coolify
        image: ghcr.io/coollabsio/coolify:latest
        restart: always
        ports:
            - "8000:8080"
        working_dir: /var/www/html
        extra_hosts:
            - host.docker.internal:host-gateway
        networks:
            - coolify
        volumes:
            - /data/coolify/source/.env:/var/www/html/.env:ro
            - /data/coolify/ssh:/var/www/html/storage/app/ssh
            - /data/coolify/applications:/var/www/html/storage/app/applications
            - /data/coolify/databases:/var/www/html/storage/app/databases
            - /data/coolify/services:/var/www/html/storage/app/services
            - /data/coolify/backups:/var/www/html/storage/app/backups
            - /data/coolify/webhooks-during-maintenance:/var/www/html/storage/app/webhooks-during-maintenance
            - /var/run/docker.sock:/var/run/docker.sock
        environment:
            - APP_ENV=production
            - APP_DEBUG=false
        depends_on:
            postgres:
                condition: service_healthy
            redis:
                condition: service_started
            soketi:
                condition: service_started
        healthcheck:
            test: ["CMD", "curl", "-f", "http://localhost:8080/api/health"]
            interval: 10s
            timeout: 5s
            retries: 5
    postgres:
        image: postgres:15-alpine
        container_name: coolify-db
        restart: always
        networks:
            - coolify
        environment:
            POSTGRES_USER: ${DB_USERNAME:-coolify}
            POSTGRES_PASSWORD: ${DB_PASSWORD}
            POSTGRES_DB: coolify
        volumes:
            - coolify-db:/var/lib/postgresql/data
        healthcheck:
            test: ["CMD-SHELL", "pg_isready -U ${DB_USERNAME:-coolify}"]
            interval: 10s
            timeout: 5s
            retries: 5
    redis:
        image: redis:7-alpine
        container_name: coolify-redis
        restart: always
        networks:
            - coolify
        command: redis-server --requirepass ${REDIS_PASSWORD}
        volumes:
            - coolify-redis:/data
    soketi:
        image: quay.io/soketi/soketi:1.6-16-debian
        container_name: coolify-realtime
        extra_hosts:
            - host.docker.internal:host-gateway
        restart: always
        networks:
            - coolify
        environment:
            SOKETI_DEBUG: "false"
            SOKETI_DEFAULT_APP_ID: ${PUSHER_APP_ID}
            SOKETI_DEFAULT_APP_KEY: ${PUSHER_APP_KEY}
            SOKETI_DEFAULT_APP_SECRET: ${PUSHER_APP_SECRET}
networks:
    coolify:
        external: true
volumes:
    coolify-db:
        external: true
    coolify-redis:
        external: true
EOF
```

### 3. Start Coolify

```bash
docker compose up -d
```

### 4. Verify

```bash
# All 4 containers should be running
docker ps | grep coolify

# Test locally
curl -s http://localhost:8000/ | head -5
```

## Important Notes

- **Database is safe**: Data is stored in Docker volume `coolify-db`, not the compose file
- **Port mapping**: Coolify runs internally on 8080, exposed on 8000
- **Cloudflare Tunnel**: Must point to `http://192.168.18.100:8000` (LXC container IP)
- **Network**: Uses external `coolify` network shared with deployed apps

## Verification Commands

```bash
# Check container status
docker ps -a | grep coolify

# Check Coolify logs
docker logs coolify --tail 50

# Check database connectivity
docker exec coolify-db pg_isready -U coolify

# List Docker volumes (your data)
docker volume ls | grep coolify
```
