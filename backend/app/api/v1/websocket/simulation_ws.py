"""
WebSocket endpoint for real-time satellite position streaming.
Serves client-requested positions at 30 Hz.

Protocol:
  Client → Server:
    {"type": "subscribe",   "satellite_ids": [25544, ...]}
    {"type": "set_time",    "sim_time_unix": float}
    {"type": "set_speed",   "multiplier": float}
    {"type": "ping"}
  Server → Client:
    {"type": "positions_update", "sim_time_unix": float, "positions": {...}}
    {"type": "pong"}
    {"type": "error", "code": str, "message": str}
"""

import asyncio
import time
import math
from uuid import uuid4
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.domain.astrodynamics.kepler import (
    solve_kepler_newton, eccentric_to_true, MU_EARTH,
)

router = APIRouter()


class SimState:
    def __init__(self):
        self.sim_time    = time.time()
        self.speed       = 1.0
        self.paused      = False
        self.subscribed  = {}  # norad_id → sat_params dict


@router.websocket("/ws/simulation")
async def simulation_ws(ws: WebSocket):
    await ws.accept()
    state = SimState()
    last_wall = time.monotonic()

    async def broadcast():
        nonlocal last_wall
        while True:
            now      = time.monotonic()
            dt       = now - last_wall
            last_wall = now

            if not state.paused:
                state.sim_time += dt * state.speed

            positions = {}
            for norad_id, sat in state.subscribed.items():
                try:
                    r = _propagate_kepler_fast(sat, state.sim_time)
                    positions[norad_id] = {"r": r}
                except Exception:
                    pass

            await ws.send_json({
                "type":         "positions_update",
                "sim_time_unix": state.sim_time,
                "positions":    positions,
            })
            await asyncio.sleep(1 / 30)  # 30 Hz

    task = asyncio.create_task(broadcast())
    try:
        async for msg in ws.iter_json():
            _handle_message(msg, state)
    except WebSocketDisconnect:
        pass
    finally:
        task.cancel()


def _handle_message(msg: dict, state: SimState):
    mtype = msg.get("type")
    if mtype == "subscribe":
        for sat_data in msg.get("satellites", []):
            nid = sat_data.get("norad_id")
            if nid:
                state.subscribed[nid] = sat_data
    elif mtype == "set_time":
        state.sim_time = float(msg["sim_time_unix"])
    elif mtype == "set_speed":
        state.speed = float(msg["multiplier"])
    elif mtype == "pause":
        state.paused = True
    elif mtype == "resume":
        state.paused = False


def _propagate_kepler_fast(sat: dict, sim_time: float) -> list[float]:
    """Fast Kepler propagation — returns [rx, ry, rz] in km (ECI)."""
    TWO_PI  = 2 * math.pi
    a       = float(sat["semi_major_axis"])
    e       = float(sat["eccentricity"])
    M0      = float(sat.get("mean_anomaly", 0))
    epoch   = float(sat.get("epoch", 0))
    n_rad   = float(sat.get("n_rad_s", math.sqrt(MU_EARTH / a**3)))

    # Precomputed rotation matrix rows
    r11 = float(sat.get("_r11", 1)); r12 = float(sat.get("_r12", 0))
    r21 = float(sat.get("_r21", 0)); r22 = float(sat.get("_r22", 1))
    r31 = float(sat.get("_r31", 0)); r32 = float(sat.get("_r32", 0))

    M    = (M0 + n_rad * (sim_time - epoch)) % TWO_PI
    if M < 0:
        M += TWO_PI
    E    = solve_kepler_newton(M, e)
    nu   = eccentric_to_true(E, e)

    p    = a * (1 - e * e)
    r_m  = p / (1 + e * math.cos(nu))
    xo   = r_m * math.cos(nu)
    yo   = r_m * math.sin(nu)

    return [r11*xo + r12*yo, r21*xo + r22*yo, r31*xo + r32*yo]
