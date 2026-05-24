"""
Satellier Simulador — FastAPI backend entry point.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.v1 import satellites, propagation, maneuvers, catalog
from app.api.v1.websocket import simulation_ws
from app.infrastructure.database.session import engine
from app.infrastructure.database.models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    # Create all tables if they don't exist (dev convenience — equivalent to
    # running `alembic upgrade head` for the initial schema).
    # In production, use alembic migrations instead.
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:
        # DB might not be available yet (e.g., running without Docker).
        # The app still starts; endpoints will return 503 on DB calls.
        import logging
        logging.getLogger("satellier").warning(
            "Database not reachable on startup: %s — DB endpoints will fail.", exc
        )

    yield
    # ── Shutdown ──────────────────────────────────────────────────────────────
    await engine.dispose()


app = FastAPI(
    title="Satellier Simulador API",
    description="Aerospace orbital mechanics simulation backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routers
app.include_router(satellites.router,  prefix="/api/v1/satellites",  tags=["satellites"])
app.include_router(propagation.router, prefix="/api/v1",             tags=["propagation"])
app.include_router(maneuvers.router,   prefix="/api/v1/maneuvers",   tags=["maneuvers"])
app.include_router(catalog.router,     prefix="/api/v1/catalog",     tags=["catalog"])

# WebSocket
app.include_router(simulation_ws.router, tags=["websocket"])


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "version": "1.0.0"}
