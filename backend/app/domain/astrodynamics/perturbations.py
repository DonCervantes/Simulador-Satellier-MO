"""Atmospheric density and perturbation models."""

import math
import numpy as np
from .kepler import R_EARTH


def exponential_density(alt_km: float) -> float:
    """
    Exponential atmosphere model. Vallado Table 9-3.
    @returns density in kg/m³
    """
    layers = [
        (0,    1.225,       8.44),
        (25,   3.899e-2,    6.49),
        (30,   1.774e-2,    6.75),
        (40,   3.972e-3,    7.77),
        (50,   1.057e-3,    8.82),
        (60,   3.206e-4,    9.87),
        (70,   8.770e-5,    10.92),
        (80,   1.905e-5,    13.24),
        (100,  5.408e-7,    16.65),
        (150,  2.070e-9,    22.52),
        (200,  2.789e-10,   29.74),
        (300,  1.806e-11,   53.63),
        (400,  3.396e-12,   53.63),
        (500,  5.297e-13,   56.22),
        (600,  8.380e-14,   67.25),
        (700,  1.136e-14,   84.57),
        (800,  1.585e-15,   97.35),
        (900,  6.967e-16,   100.0),
        (1000, 1.338e-16,   120.0),
    ]

    idx = len(layers) - 1
    for k in range(len(layers) - 1):
        if alt_km < layers[k + 1][0]:
            idx = k
            break

    h0, rho0, H = layers[idx]
    return rho0 * math.exp(-(alt_km - h0) / H)
