# NetPulse — Network Monitoring Dashboard

Full-stack containerized monitoring system: React frontend + FastAPI backend + TimescaleDB + Redis.

## Quick Start

### Local Development

```bash
# Copy environment template
cp .env.example .env

# Edit .env and set POSTGRES_PASSWORD to a strong value

# Build and run locally
docker compose up --build
```

Then open:
- **Frontend:** http://localhost:5173
- **API:** http://localhost:8000
- **Docs:** http://localhost:8000/docs

### Production (with pre-built images from GHCR)

```bash
cp .env.example .env
# Edit .env with a strong POSTGRES_PASSWORD

export IMAGE_TAG=latest
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --pull always
```

## Architecture

**Frontend** (React 18 + Vite + TypeScript)
- Real-time monitoring dashboard with simulated engine
- Device, check, alert, and event management
- Live charts (Recharts) and status visualization
- Code-split bundle: core 59KB, vendor chunks optimized

**Backend** (FastAPI)
- RESTful API for devices, checks, events, alerts
- Health check endpoint at `/health`
- CORS-enabled for frontend communication
- Ready for TimescaleDB integration

**Data Layer**
- **TimescaleDB** (PostgreSQL 14) for time-series data
- **Redis** for caching and job queues
- Persistent volumes for data

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`):
1. Builds and pushes frontend + backend to GHCR on push to `master`
2. Runs smoke tests in CI environment
3. Images tagged as `:latest` and `:sha-<commit>`

See [DEPLOY.md](DEPLOY.md) for GitHub secrets setup and detailed deployment guide.

## Key Features

- ✅ Multi-stage Docker builds (optimized layers)
- ✅ Health checks on all services with `restart: unless-stopped`
- ✅ Comprehensive error handling and logging
- ✅ Dev proxy from frontend to backend API
- ✅ Vite code-splitting for <600KB gzip
- ✅ Full TypeScript throughout
- ✅ Realistic seed data (10 devices, 15 checks, full event/alert history)
- ✅ Zustand state management with tick-based simulation engine
- ✅ Production-ready compose override using GHCR images

## File Structure

```
.
├── Dockerfile                    # Frontend build (Node 20 → serve)
├── backend/
│   ├── Dockerfile              # Backend build (Python 3.11 slim)
│   └── main.py                 # FastAPI app
├── docker-compose.yml          # Dev composition (with build:)
├── docker-compose.prod.yml     # Prod override (image: from GHCR)
├── src/
│   ├── App.tsx                 # Root component
│   ├── store/monitor.ts        # Zustand store + simulation engine
│   ├── lib/
│   │   ├── types.ts           # Domain types
│   │   ├── seed.ts            # Realistic test data
│   │   ├── api.ts             # REST client
│   │   └── util.ts            # Helpers
│   ├── pages/                  # Dashboard, Devices, Events, Alerts, Reports
│   └── components/ui.tsx       # UI kit (Card, Button, StatusPill, etc.)
├── vite.config.ts             # Build config + dev proxy + code-split
├── tsconfig.json              # TypeScript strict mode
├── package.json               # Frontend dependencies
├── requirements.txt           # Backend dependencies
├── .github/workflows/ci.yml   # GitHub Actions CI/CD
├── DEPLOY.md                  # Deployment guide
└── .env.example               # Environment template
```

## Development

### Hot Reload

Frontend: Vite dev server watches `src/` and hot-reloads
Backend: API runs with `--reload` flag in dev mode

Watch for changes:
```bash
docker compose up
```

### Testing the Simulation

The frontend includes a simulated monitoring engine (no real checks needed). Use the dashboard to:
- Pause/resume the engine
- Adjust simulation speed (1-120x)
- Inject faults on individual devices
- Manage devices, checks, alerts, and rules
- View live events and reports

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Commit: `git commit -am 'feat: description'`
3. Push: `git push origin feature/my-feature`
4. Open a pull request

The CI pipeline will automatically build and test your changes.

## License

MIT

---

**Status:** Production-ready. See [DEPLOY.md](DEPLOY.md) for secrets setup and deployment steps.
