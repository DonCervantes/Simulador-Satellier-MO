# Satellier Simulador

A professional aerospace engineering space mission simulator built as a thesis capstone. Real-time orbital mechanics for 8,247 satellites with J2 perturbations, maneuver planning, and ground track visualization.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript 5 + Vite 5, CesiumJS globe |
| Physics (client) | TypeScript domain layer + Rust/WASM batch Kepler |
| Backend | FastAPI (Python 3.12) + scipy RK45 |
| Database | PostgreSQL 16 (PostGIS) + Redis 7 |
| ETL | Python enricher — fixes all 5 bugs from original ETL |

## Physics Accuracy

- **Kepler solver**: Newton-Raphson with corrected denominator `(1 − e·cos(E))` — Battin initial estimate, 1e-12 tolerance
- **State vector ↔ COE**: Vallado Algorithm 9/10
- **J2 secular rates**: Vallado Eq. 9-40 (RAAN regression, apsidal precession)
- **Perturbation integration**: scipy RK45, rtol=1e-10 (backend)
- **Frame conversion**: GMST IAU 1982 (client), astropy GCRS→ITRS (backend)

## Quick Start

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Python 3.12+](https://www.python.org/downloads/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Rust toolchain](https://rustup.rs/) + `wasm-pack` (for WASM build)

### Development

```bash
# 1. Start infrastructure
docker-compose up -d postgres redis

# 2. Backend
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# 3. Frontend
cd frontend
npm install
npm run dev
# → http://localhost:5173

# 4. Build WASM (optional — JS fallback works without it)
cd wasm-physics
wasm-pack build --target web --out-dir ../frontend/src/infrastructure/wasm
```

### Docker (all services)

```bash
cp .env.example .env
# Set CESIUM_ION_TOKEN in .env
docker-compose up --build
# → Frontend: http://localhost:3000
# → API:      http://localhost:8000
```

## ETL — Load Satellite Catalog

```bash
# Download TLE data from Celestrak
python etl/enricher.py --input celestrak.txt --output satellites_enriched.json

# Or run the daily Celery worker (after backend is running)
celery -A app.workers.tle_updater worker --beat --loglevel=info
```

## Tests

```bash
cd frontend && npm run test         # 33 unit tests (Kepler, StateVector, Maneuvers)
cd backend  && pytest -v            # Python physics tests (requires Python 3.12)
```

## Validation

Physics validated against:
- **GMAT 2022a**: Kepler propagation (ISS 24h, error < 5 km)
- **Poliastro**: Hohmann Δv (Vallado Example 6-1: 3.935 km/s ✓)
- **Orekit 11.3**: J2+drag (ISS 24h, error < 1 km)

See `PART X` of the engineering plan for the full validation test matrix.

## Key Bugs Fixed (vs. original codebase)

| Bug | Location | Fix |
|---|---|---|
| Wrong RAAN storage (Ω−ω) | `ETL/ETL.py` | `etl/enricher.py` stores Ω and ω separately |
| Wrong Kepler denominator `cos(M)` | `OrbitalMovement.cpp` | `KeplerSolver.ts` uses `(1−e·cos(E))` |
| Missing M₀ at epoch | `ETL/ETL.py` | Extracted and stored as `meanAnomaly` |
| Missing raw mean motion | `ETL/ETL.py` | Stored as `meanMotion` rev/day |
| Missing B* drag term | `ETL/ETL.py` | Extracted cols 53-61, stored as `bstar` |

## References

- Vallado — *Fundamentals of Astrodynamics and Applications*, 4th ed. (2013)
- Curtis — *Orbital Mechanics for Engineering Students*, 4th ed. (2019)
- Battin — *An Introduction to the Mathematics and Methods of Astrodynamics* (1987)
