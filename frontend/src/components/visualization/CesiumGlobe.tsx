/**
 * Primary 3D visualization component — CesiumJS globe with real-time satellite rendering.
 *
 * Features:
 *   - Earth with Natural Earth II imagery (no token needed)
 *   - Real-time satellite positions from Zustand store
 *   - Satellite selection on click + camera fly-to
 *   - Orbital ellipse trace for selected satellite (120-point Keplerian ellipse)
 *   - ECI → ECEF conversion via CesiumJS ICRF transform (GMST fallback)
 */

import { useEffect, useRef, useCallback } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useSatelliteStore }  from '../../store/satelliteStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useMissionStore }    from '../../store/missionStore';
import { eciToEcef }          from '../../domain/astrodynamics/FrameConverter';
import { TAU }                from '../../domain/astrodynamics/constants';

// Cesium Ion token — set via env variable (optional, not required for NaturalEarth)
const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_TOKEN ?? '';
if (CESIUM_ION_TOKEN) Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;

// Number of segments in the orbital ellipse trace (higher = smoother)
const ORBIT_SEGMENTS = 120;

// Orbit trace color (cyan, semi-transparent)
const ORBIT_COLOR = Cesium.Color.fromCssColorString('#00d4ff').withAlpha(0.55);

interface Props {
  className?: string;
}

export function CesiumGlobe({ className }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const viewerRef     = useRef<Cesium.Viewer | null>(null);
  const pointsRef     = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const pointMapRef   = useRef<Map<number, Cesium.PointPrimitive>>(new Map());
  const orbitLinesRef   = useRef<Cesium.PolylineCollection | null>(null);
  const orbitLineRef    = useRef<Cesium.Polyline | null>(null);
  const missionLinesRef = useRef<Cesium.PolylineCollection | null>(null);

  const { positions, selectedId, setSelectedId } = useSatelliteStore();
  const { simTimeUnix } = useSimulationStore();
  const { result: missionResult, params: missionParams, showOnGlobe } = useMissionStore();

  // ── Helper: ECI Vec3 (km) → Cesium.Cartesian3 (m, ECEF) ──────────────────
  const eciToCartesian = useCallback((
    eciKm: { x: number; y: number; z: number },
    simTime: number,
    cesiumTime: Cesium.JulianDate,
  ): Cesium.Cartesian3 => {
    try {
      const eci         = new Cesium.Cartesian3(eciKm.x * 1000, eciKm.y * 1000, eciKm.z * 1000);
      const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(cesiumTime);
      if (icrfToFixed) {
        return Cesium.Matrix3.multiplyByVector(icrfToFixed, eci, new Cesium.Cartesian3());
      }
    } catch { /* fall through */ }
    const ecef = eciToEcef(eciKm, simTime);
    return new Cesium.Cartesian3(ecef.x * 1000, ecef.y * 1000, ecef.z * 1000);
  }, []);

  // ── Initialize Viewer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer:             false,
      terrainProvider:       undefined,
      baseLayerPicker:       false,
      geocoder:              false,
      homeButton:            false,
      sceneModePicker:       false,
      navigationHelpButton:  false,
      infoBox:               false,
      selectionIndicator:    false,
      timeline:              false,
      animation:             false,
      fullscreenButton:      false,
      scene3DOnly:           true,
    });

    // Natural Earth II (bundled). Falls back to OSM if assets missing.
    viewer.imageryLayers.add(
      Cesium.ImageryLayer.fromProviderAsync(
        Cesium.TileMapServiceImageryProvider.fromUrl(
          Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')
        ).catch(() =>
          new Cesium.UrlTemplateImageryProvider({
            url:    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            credit: new Cesium.Credit('© OpenStreetMap contributors'),
          })
        )
      ),
      0
    );

    viewer.scene.globe.enableLighting       = false;
    viewer.scene.fog.enabled                = false;
    viewer.scene.backgroundColor            = Cesium.Color.BLACK;
    viewer.scene.globe.showGroundAtmosphere = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(0, 20, 20_000_000),
      orientation: { heading: 0, pitch: -Cesium.Math.toRadians(90), roll: 0 },
    });

    // Batch collections
    pointsRef.current      = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    orbitLinesRef.current  = viewer.scene.primitives.add(new Cesium.PolylineCollection());
    missionLinesRef.current = viewer.scene.primitives.add(new Cesium.PolylineCollection());

    // Click → select satellite
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      if (Cesium.defined(picked) && picked.id !== undefined) {
        setSelectedId(Number(picked.id));
      } else {
        setSelectedId(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;

    return () => {
      handler.destroy();
      pointMapRef.current.clear();
      pointsRef.current      = null;
      orbitLinesRef.current  = null;
      orbitLineRef.current   = null;
      missionLinesRef.current = null;
      viewerRef.current      = null;
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync satellite points ──────────────────────────────────────────────────
  useEffect(() => {
    const points = pointsRef.current;
    const viewer = viewerRef.current;
    if (!points || !viewer || points.isDestroyed() || viewer.isDestroyed()) return;

    const cesiumTime = Cesium.JulianDate.fromDate(new Date(simTimeUnix * 1000));

    positions.forEach((pos, noradId) => {
      const ecefPos  = eciToCartesian(pos.r, simTimeUnix, cesiumTime);
      const isSel    = noradId === selectedId;
      const color    = isSel
        ? Cesium.Color.YELLOW
        : Cesium.Color.fromCssColorString('#00d4ff').withAlpha(0.9);

      const existing = pointMapRef.current.get(noradId);
      if (existing) {
        existing.position  = ecefPos;
        existing.color     = color;
        existing.pixelSize = isSel ? 8 : 3;
      } else {
        const point = points.add({
          position:        ecefPos,
          color,
          pixelSize:       3,
          id:              noradId,
          scaleByDistance: new Cesium.NearFarScalar(1e3, 2, 4e7, 0.5),
        });
        pointMapRef.current.set(noradId, point);
      }
    });
  }, [positions, selectedId, simTimeUnix, eciToCartesian]);

  // ── Orbital ellipse trace for selected satellite ───────────────────────────
  useEffect(() => {
    const orbitLines = orbitLinesRef.current;
    const viewer     = viewerRef.current;
    if (!orbitLines || !viewer || orbitLines.isDestroyed() || viewer.isDestroyed()) return;

    // Clear previous trace
    orbitLines.removeAll();
    orbitLineRef.current = null;

    if (selectedId === null) return;

    const sat = useSatelliteStore.getState().catalog.find(s => s.noradId === selectedId);
    if (!sat?._r11) return;

    const { semiMajorAxis: a, eccentricity: e,
            _r11, _r12, _r21, _r22, _r31, _r32 } = sat;
    const p       = a * (1 - e * e);           // semi-latus rectum (km)
    const simTime = useSimulationStore.getState().simTimeUnix;
    const cesiumTime = Cesium.JulianDate.fromDate(new Date(simTime * 1000));

    // Parametric Keplerian ellipse: step ν from 0 → 2π
    // +1 closes the loop back to the start point
    const pts: Cesium.Cartesian3[] = [];
    for (let k = 0; k <= ORBIT_SEGMENTS; k++) {
      const nu   = (k / ORBIT_SEGMENTS) * TAU;
      const rMag = p / (1 + e * Math.cos(nu));
      const xOrb = rMag * Math.cos(nu);
      const yOrb = rMag * Math.sin(nu);

      // Perifocal → ECI via precomputed rotation matrix rows
      const eciKm = {
        x: _r11! * xOrb + _r12! * yOrb,
        y: _r21! * xOrb + _r22! * yOrb,
        z: _r31! * xOrb + _r32! * yOrb,
      };

      pts.push(eciToCartesian(eciKm, simTime, cesiumTime));
    }

    orbitLineRef.current = orbitLines.add({
      positions:    pts,
      width:        1.5,
      arcType:      Cesium.ArcType.NONE,   // straight lines in 3D, not geodesic
      material:     Cesium.Material.fromType('Color', { color: ORBIT_COLOR }),
    });
  }, [selectedId, eciToCartesian]); // recomputes when selection changes

  // ── Mission orbit visualization ───────────────────────────────────────────
  useEffect(() => {
    const missionLines = missionLinesRef.current;
    const viewer       = viewerRef.current;
    if (!missionLines || !viewer || missionLines.isDestroyed() || viewer.isDestroyed()) return;

    missionLines.removeAll();

    if (!showOnGlobe || !missionResult) return;

    const simTime    = useSimulationStore.getState().simTimeUnix;
    const cesiumTime = Cesium.JulianDate.fromDate(new Date(simTime * 1000));

    // Rotation matrix for inclination-only orbit (RAAN=0, ω=0, i=inclination_deg)
    const inc   = missionParams.inclination_deg * Math.PI / 180;
    const cosI  = Math.cos(inc);
    const sinI  = Math.sin(inc);
    // PQW → ECI: x_eci=xOrb, y_eci=yOrb*cosI, z_eci=yOrb*sinI

    const makeOrbit = (a_km: number, ecc: number, nuStart: number, nuEnd: number, pts = 120) => {
      const pSlr = a_km * (1 - ecc * ecc);
      const positions: Cesium.Cartesian3[] = [];
      for (let k = 0; k <= pts; k++) {
        const nu   = nuStart + (nuEnd - nuStart) * (k / pts);
        const rMag = pSlr / (1 + ecc * Math.cos(nu));
        const xOrb = rMag * Math.cos(nu);
        const yOrb = rMag * Math.sin(nu);
        const eciKm = { x: xOrb, y: yOrb * cosI, z: yOrb * sinI };
        positions.push(eciToCartesian(eciKm, simTime, cesiumTime));
      }
      return positions;
    };

    const { r1_km, r2_km, aTransfer_km, eTransfer } = missionResult;

    // Initial orbit (circular, blue)
    missionLines.add({
      positions: makeOrbit(r1_km, 0, 0, TAU),
      width:     1.5,
      arcType:   Cesium.ArcType.NONE,
      material:  Cesium.Material.fromType('Color', {
        color: Cesium.Color.fromCssColorString('#4488ff').withAlpha(0.7),
      }),
    });

    // Transfer ellipse (amber — only the half-ellipse from periapsis → apoapsis)
    missionLines.add({
      positions: makeOrbit(aTransfer_km, eTransfer, 0, Math.PI, 120),
      width:     2,
      arcType:   Cesium.ArcType.NONE,
      material:  Cesium.Material.fromType('Color', {
        color: Cesium.Color.fromCssColorString('#ffd93d').withAlpha(0.85),
      }),
    });

    // Target orbit (circular, green)
    missionLines.add({
      positions: makeOrbit(r2_km, 0, 0, TAU),
      width:     1.5,
      arcType:   Cesium.ArcType.NONE,
      material:  Cesium.Material.fromType('Color', {
        color: Cesium.Color.fromCssColorString('#00c853').withAlpha(0.7),
      }),
    });
  }, [showOnGlobe, missionResult, missionParams.inclination_deg, eciToCartesian]);

  // ── Camera fly-to selected satellite ──────────────────────────────────────
  const focusOnSatellite = useCallback((noradId: number) => {
    const viewer = viewerRef.current;
    const pos    = useSatelliteStore.getState().positions.get(noradId);
    if (!viewer || !pos || viewer.isDestroyed()) return;

    const simTime = useSimulationStore.getState().simTimeUnix;
    const ecef    = eciToEcef(pos.r, simTime);
    viewer.camera.flyTo({
      destination: new Cesium.Cartesian3(
        ecef.x * 1000 * 1.5,
        ecef.y * 1000 * 1.5,
        ecef.z * 1000 * 1.5,
      ),
      duration: 1.5,
    });
  }, []);

  useEffect(() => {
    if (selectedId !== null) focusOnSatellite(selectedId);
  }, [selectedId, focusOnSatellite]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', background: '#000' }}
    />
  );
}
