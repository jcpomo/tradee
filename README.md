# Apex Dashboard

A full-stack application for multi-account trading analytics. Built with Node.js, React, and PostgreSQL.

## Monorepo Layout

```
apex-dashboard/
├── web/                    # Frontend (Vite + React)
│   ├── src/               # React components, pages, stores
│   ├── Dockerfile.dev     # Development image
│   └── package.json       # Frontend dependencies
│
├── server/                # Backend API (Node.js + Fastify)
│   ├── src/
│   │   ├── index.js       # Server entry point
│   │   ├── auth.js        # Authentication (register, login, refresh)
│   │   ├── endpoints.js   # API routes (accounts, trades, import, etc.)
│   │   ├── guard.js       # Auth middleware & account validation
│   │   ├── migrate.js     # Database migrations
│   │   ├── parser.js      # CSV import parser
│   │   └── test.js        # Test suite
│   ├── Dockerfile         # Production image
│   └── package.json       # Backend dependencies
│
├── docs/
│   ├── DEPLOY.md          # Dokploy deployment guide
│   └── superpowers/       # Design docs, specs, and plans
│
├── docker-compose.yml     # Development environment
├── docker-compose.prod.yml # Production environment
└── .env.example           # Environment variable template
```

## Quick Start (Development)

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development without Docker)

### Setup

1. Copy environment template:
   ```bash
   cp .env.example .env
   ```

2. Start all services:
   ```bash
   docker compose up
   ```

   This starts:
   - PostgreSQL on `localhost:5432`
   - API on `http://localhost:3001`
   - Frontend on `http://localhost:5173`

3. Open in browser:
   - **Frontend**: http://localhost:5173
   - **API Health Check**: http://localhost:3001/health

### Stopping Services

```bash
docker compose down
```

## API Documentation

### Base URL

**Development**: `http://localhost:3001`  
**Production**: Configured via `WEB_API_URL` environment variable

### Key Endpoints

#### Health Check
```
GET /health
```

#### Authentication
```
POST /register           # Create account and user
POST /login              # Get access & refresh tokens
POST /refresh            # Renew access token
POST /logout             # Invalidate refresh token
```

#### Account Management
```
GET  /accounts           # List user's accounts
POST /accounts           # Create new account
GET  /accounts/:id       # Get account details
PATCH /accounts/:id      # Update account
POST /accounts/:id/activate  # Set as active account
POST /accounts/:id/reset-preset  # Reset to default preset
```

#### Trading Data
```
GET /state               # Get user's state (accounts, trades, daily)
GET /trades              # Get trades for active account
POST /trades             # Add trade manually
GET /daily               # Get daily summaries
POST /import             # Upload CSV file
GET /import              # Get import history
POST /import/:id/undo    # Revert an import
```

All endpoints support query parameter `?accountId=<id>` to query a specific account (if authorized).

## Testing

### Run Server Tests

```bash
cd server && npm test
```

Tests cover:
- Authentication (register, login, refresh)
- Account CRUD operations
- Trade calculations with different modes
- CSV import and parsing
- Database migrations
- Rate limiting and security middleware

### Test Database

Tests use an isolated PostgreSQL instance. To run tests manually:

```bash
docker run --rm -d --name apex-pg-test \
  -e POSTGRES_USER=apex \
  -e POSTGRES_PASSWORD=apex \
  -e POSTGRES_DB=apex \
  -p 5432:5432 \
  postgres:16 && sleep 3

cd server && npm test

docker stop apex-pg-test
```

## Architecture

### Frontend (web/)

- **Framework**: Vite + React
- **State Management**: Zustand (store)
- **Styling**: Tailwind CSS
- **Features**:
  - Multi-account selector
  - Real-time trade management
  - CSV import with preview
  - Account settings per account

### Backend (server/)

- **Framework**: Fastify (fast, lightweight Node.js framework)
- **Database**: PostgreSQL 16
- **Authentication**: JWT (access + refresh tokens)
- **Password Hashing**: Argon2
- **Security**: Helmet, CORS, Rate Limiting
- **Features**:
  - Multi-account isolation
  - CSV import with round-trip consistency
  - Automatic migrations on startup
  - Health check endpoint

### Database Schema

- **users**: Authentication and account ownership
- **accounts**: Multi-account support per user
- **trades**: Individual trade records (isolated by account)
- **daily**: Daily summary rollups (isolated by account)
- **imports**: Import history and undo capability

## Environment Variables

See `.env.example` for all available variables. Key variables:

### Development
```env
NODE_ENV=development
POSTGRES_USER=apex
POSTGRES_PASSWORD=apex
POSTGRES_DB=apex
DATABASE_URL=postgres://apex:apex@db:5432/apex
PORT=3001
WEB_ORIGIN=http://localhost:5173
VITE_API_URL=http://localhost:3001
```

### Production
```env
NODE_ENV=production
POSTGRES_USER=<unique_username>
POSTGRES_PASSWORD=<secure_random>      # Generate: openssl rand -hex 32
POSTGRES_DB=<unique_database>
DATABASE_URL=postgres://<user>:<pass>@db:5432/<db>
JWT_ACCESS_SECRET=<secure_random>      # Generate: openssl rand -hex 32
JWT_REFRESH_SECRET=<secure_random>     # Generate: openssl rand -hex 32
WEB_ORIGIN=https://your-domain.com
WEB_API_URL=https://api.your-domain.com
```

See [docs/DEPLOY.md](./docs/DEPLOY.md) for complete production setup.

## Documentation

- **[Deployment Guide](./docs/DEPLOY.md)**: Step-by-step Dokploy deployment
- **[Spec & Design](./docs/superpowers/specs/2026-07-23-backend-auth-import-design.md)**: Technical specification
- **[Implementation Plan](./docs/superpowers/plans/2026-07-23-backend-auth-import.md)**: Development phases and architecture

## Development Workflow

### Starting a New Feature

1. Create a branch: `git checkout -b feature/your-feature`
2. Make changes to `server/src/` and/or `web/src/`
3. If modifying database schema, add migration to `server/src/migrate.js`
4. Run tests: `cd server && npm test`
5. Commit and push

### Local Development Tips

- **Hot Reload**: Frontend and server both support hot reload (via Docker volumes)
- **Database Inspection**: Connect with psql:
  ```bash
  psql -h localhost -U apex -d apex
  ```
- **Server Logs**: `docker logs <container_id> -f`
- **API Testing**: Use curl or Postman; see endpoints above

## Security

- All passwords hashed with Argon2
- JWT tokens with short expiration (15 min access, 7 day refresh)
- CORS limited to configured origin
- Rate limiting active on `/auth/*` only (max 20 req/min, e.g. login/register); no global `/api` limit yet — recommended future hardening, since `/api/import/preview` parses CSVs up to 5MB
- Helmet headers for XSS/clickjacking protection
- In production, HTTPS enforced via Traefik/Dokploy

See [docs/DEPLOY.md](./docs/DEPLOY.md) for production security checklist.

## Troubleshooting

### Database won't connect

```bash
docker compose down --volumes  # Remove data
docker compose up              # Restart fresh
```

### Port already in use

Change in `docker-compose.yml`:
```yaml
ports: ['5173:5173']  # Change first number to unused port
```

### Tests fail

Ensure:
- PostgreSQL is running: `docker ps | grep postgres`
- Database is healthy: `docker logs <db_container>`
- Run migrations: `cd server && npm run migrate`

## License

Built by Apex Dashboard team.
