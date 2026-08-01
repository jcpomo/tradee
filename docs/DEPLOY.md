# Deployment Guide: Dokploy

This guide covers deploying the Apex Dashboard stack on a production server using **Dokploy** (Docker + Traefik).

## Architecture Overview

The application consists of three services:

- **Database** (PostgreSQL 16): Persistent data storage
- **Server** (Node.js): REST API with authentication and business logic
- **Web** (Vite React): Frontend SPA served by Dokploy

All services are containerized and orchestrated via Docker Compose.

## Deployment Options

### Option 1: Deploy via Docker Compose (Recommended for Dokploy)

Use `docker-compose.prod.yml` to deploy all three services at once.

### Option 2: Deploy Individual Services

Deploy each service separately in Dokploy:

1. **Database Service**
   - Image: `postgres:16`
   - Ports: `5432` (internal only, not exposed)
   - Volumes: Persistent volume for PostgreSQL data
   - Environment: Set `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`

2. **Server Service**
   - Build from `./server` directory
   - Ports: `3001` (internal, exposed via Traefik)
   - Depends on: Database service
   - Environment: All variables listed below

3. **Web Service**
   - Build from `./web` directory
   - Build arg: `VITE_API_URL` (set to production API domain)
   - No ports needed (served via Traefik)
   - Depends on: Server service

## Required Environment Variables

Before deployment, generate or set these environment variables:

### Database Credentials

```env
POSTGRES_USER=<username>           # e.g., apex_prod
POSTGRES_PASSWORD=<random_32_hex>  # Generate: openssl rand -hex 32
POSTGRES_DB=<database_name>        # e.g., apex_prod
```

### Database Connection

```env
DATABASE_URL=postgres://<user>:<password>@db:5432/<database>
# Example: postgres://apex_prod:abc123...@db:5432/apex_prod
```

### JWT Secrets

Generate secure random secrets (required for authentication):

```bash
openssl rand -hex 32
```

Set in environment:

```env
JWT_ACCESS_SECRET=<random_32_hex>    # Short-lived tokens (15 min)
JWT_REFRESH_SECRET=<random_32_hex>   # Refresh tokens (7 days)
```

### Frontend Configuration

```env
WEB_ORIGIN=https://your-domain.com       # Frontend domain (must match deployment)
WEB_API_URL=https://api.your-domain.com  # API domain (for CORS)
```

### Runtime Environment

```env
NODE_ENV=production  # Activates security hardening (Secure cookies, etc.)
PORT=3001           # Server port (internal, exposed via Traefik)
```

## Complete Environment Example

```env
POSTGRES_USER=apex_prod
POSTGRES_PASSWORD=abc123def456...  # 64 chars from openssl rand -hex 32
POSTGRES_DB=apex_prod
DATABASE_URL=postgres://apex_prod:abc123def456...@db:5432/apex_prod
PORT=3001
WEB_ORIGIN=https://apex.example.com
WEB_API_URL=https://api.example.com
JWT_ACCESS_SECRET=xyz789abc123...  # 64 chars from openssl rand -hex 32
JWT_REFRESH_SECRET=def456xyz789...  # 64 chars from openssl rand -hex 32
NODE_ENV=production
```

## Deployment Steps with Dokploy

1. **Prepare Environment**
   - Save all environment variables to `.env` file on your server
   - Ensure all secrets are unique and generated with `openssl rand -hex 32`

2. **Upload Project**
   - Clone or upload the repository to your server
   - Place `.env` in the project root

3. **Configure Dokploy**
   - Point Dokploy to `docker-compose.prod.yml`
   - Set all environment variables in Dokploy's env configuration
   - Configure Traefik routing:
     - Frontend → `your-domain.com`
     - API → `api.your-domain.com`

4. **Deploy Services**
   ```bash
   dokploy compose up --file docker-compose.prod.yml
   ```

5. **Verify Deployment**
   ```bash
   curl https://api.your-domain.com/health  # Should return 200 OK
   ```

## TLS/HTTPS Configuration

**Dokploy handles TLS automatically via Traefik.** No manual certificate configuration needed:

- Traefik automatically provisions and renews SSL certificates (Let's Encrypt)
- All traffic is secured under HTTPS
- Redirects HTTP → HTTPS

## Important: Production Security with NODE_ENV

When `NODE_ENV=production`:

- Session cookies are set with the **`Secure` flag**, requiring HTTPS
- If you access the API over HTTP (not HTTPS), refresh tokens won't be set
- Always ensure Traefik/Dokploy routes are properly configured for HTTPS

**Failure to enable HTTPS will break authentication.**

## Database Initialization & Migrations

The server automatically runs migrations on startup:

1. Server starts
2. Connects to PostgreSQL
3. Runs pending migrations (see `src/migrate.js`)
4. Serves API requests

**No manual migration steps required.**

## Scheduled PostgreSQL Backups

For production safety, configure automated daily backups:

### Option A: Cron Job on Host

```bash
0 2 * * * docker exec apex-dashboard-db pg_dump -U apex_prod apex_prod | gzip > /backups/apex-$(date +\%Y\%m\%d).sql.gz
```

### Option B: Dokploy Volume Backup

- Use Dokploy's built-in volume backup features
- Back up the `pgdata` volume daily
- Store backups off-server

### Backup Retention

- Keep 30 days of daily backups
- Test restore procedures monthly
- Document recovery steps

## Security Checklist

Before going live, verify:

- [ ] **Unique Secrets**: All `JWT_*` and `POSTGRES_PASSWORD` generated with `openssl rand -hex 32`
- [ ] **CORS Configured**: `WEB_ORIGIN` set to actual frontend domain, not localhost
- [ ] **HTTPS Enabled**: Traefik configured, valid certificates in place
- [ ] **Rate Limiting Scope Understood**: `@fastify/rate-limit` is currently applied only to `/auth/*` (max 20 req/min, e.g. login/register brute-force protection). There is no global rate limit on `/api/*`. Consider adding one before going live, especially since `/api/import/preview` accepts and parses CSVs up to 5MB per request.
- [ ] **Dependencies Updated**: Run `npm audit fix` in both `server/` and `web/` before build
- [ ] **Database Backups**: Scheduled and tested
- [ ] **Health Checks**: `/health` endpoint responds on API domain
- [ ] **Logs Monitored**: Server and database logs configured for debugging
- [ ] **Node Version**: Server runs on Node 20+ (check `package.json` engines)

## Troubleshooting

### Server won't start

```bash
docker logs <container_id>
# Check DATABASE_URL format and credentials
```

### Frontend can't reach API

- Verify `WEB_API_URL` matches the actual API domain
- Check CORS headers: `curl -i -H "Origin: <your-domain>" https://api.your-domain.com/health`

### Cookies not being set (login fails)

- Ensure `NODE_ENV=production`
- Verify HTTPS is active (Secure flag requires HTTPS)
- Check `WEB_ORIGIN` matches the domain in the browser

### Database connection errors

- Verify `DATABASE_URL` format
- Ensure `POSTGRES_USER` and `POSTGRES_PASSWORD` match database credentials
- Check database container is healthy: `docker ps` → Database should show "healthy"

### Migrations fail

- Check PostgreSQL is running and healthy
- Review server logs for specific error messages
- Manually inspect database schema if needed

## Monitoring & Maintenance

- **Logs**: Use Dokploy's log viewer to monitor all services
- **Health**: Call `/health` endpoint daily to verify API availability
- **Disk Usage**: Monitor PostgreSQL volume growth; implement retention policies
- **Dependencies**: Run `npm audit` monthly and update security patches
- **Database**: Verify backups complete successfully daily

## Support & Resources

- **Dokploy Docs**: https://dokploy.io
- **Traefik Docs**: https://doc.traefik.io
- **PostgreSQL Docs**: https://www.postgresql.org/docs/16/
- **Fastify Docs**: https://www.fastify.io
