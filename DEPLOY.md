# Deployment Guide

## GitHub Secrets Setup

The CI/CD pipeline requires one repository secret to be configured before the deploy job will work properly.

### POSTGRES_PASSWORD

1. Navigate to: **https://github.com/Jona10i/Jona10/settings/secrets/actions**
2. Click **New repository secret**
3. **Name:** `POSTGRES_PASSWORD`
4. **Value:** A strong password (16+ characters, mixed case, numbers, symbols)
   - Example: `Tr0pic@lM0nk3y!2024`
5. Click **Add secret**

This password is used by:
- TimescaleDB (`POSTGRES_PASSWORD` environment variable)
- FastAPI backend (`DATABASE_URL` connection string)

**Note:** In CI, if the secret is not set, the pipeline will use the fallback `changeme` from the `.env` file, which is **not secure for production**.

## Workflow Overview

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to `master`:

1. **build-frontend**: Builds the React/Vite frontend, tags as `ghcr.io/jona10i/netpulse-frontend:sha-<commit>` and `latest`
2. **build-backend**: Builds the FastAPI backend, tags as `ghcr.io/jona10i/netpulse-backend:sha-<commit>` and `latest`
3. **deploy** (on `master` push only):
   - Pulls the freshly-built images from GHCR
   - Runs `docker compose up --pull always --wait` with the prod override
   - Smoke-tests frontend (port 5173) and API (port 8000)
   - Tears down the test stack (runner cleanup)

All images are pushed to **GitHub Container Registry (GHCR)**:
- Frontend: `ghcr.io/jona10i/netpulse-frontend`
- Backend: `ghcr.io/jona10i/netpulse-backend`

## Local Development

### With local builds (default):
```bash
docker compose up --build
```

### With GHCR images (production):
```bash
export IMAGE_TAG=latest  # or sha-<commit>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --pull always
```

### Environment

Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`:
```bash
cp .env.example .env
# Edit .env, change POSTGRES_PASSWORD to a strong value
```

Then run:
```bash
docker compose up
```

## Troubleshooting

### Deploy job fails with "permission denied"
- Ensure GitHub Actions has **Read and write permissions** for packages
- Go to **Settings → Actions → General → Workflow permissions**
- Select "Read and write permissions"

### Images not found in GHCR
- Check that the build jobs completed successfully
- Verify GHCR login succeeded (check workflow run logs)
- Manually verify image exists: `docker pull ghcr.io/jona10i/netpulse-frontend:latest`

### Stack won't start due to database issues
- Ensure `POSTGRES_PASSWORD` is set and non-empty
- Check `timescaledb` logs: `docker compose logs timescaledb`
- Clear volumes and restart: `docker compose down -v && docker compose up`

## Production Deployment

For production (outside CI):

1. Set up a deployment host with Docker + Docker Compose
2. Clone the repo: `git clone https://github.com/Jona10i/Jona10.git`
3. Create `.env` with strong `POSTGRES_PASSWORD`
4. Run:
   ```bash
   export IMAGE_TAG=latest
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --pull always
   ```
5. Monitor: `docker compose logs -f api frontend timescaledb redis`

The stack will start with:
- Frontend on port 5173 (or reverse-proxy it)
- API on port 8000 (or reverse-proxy it)
- TimescaleDB on port 5432 (internal only, not exposed in prod)
- Redis on port 6379 (internal only, not exposed in prod)
