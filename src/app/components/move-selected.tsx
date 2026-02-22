"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { useSelectionRegistry } from "../hooks/selection";

export default function MoveSelected({
  requireKey = "g",
  controlsRef,
  mode = "translate",
  proportionalEnabled: proportionalEnabledProp = true,
  proportionalRadius = 0.25,
  falloff = "smooth",
}: {
  requireKey?: string | null;
  controlsRef?: React.RefObject<{ enabled: boolean } | null>;
  mode?: "translate" | "rotate" | "scale";

  // ✅ new
  proportionalEnabled?: boolean;
  proportionalRadius?: number; // world units
  falloff?: "smooth" | "gaussian" | "sharp";
}) {
  const { camera, gl } = useThree();
  const registry = useSelectionRegistry();

  const pivot = useMemo(() => new THREE.Group(), []);
  const tcRef = useRef<any>(null);

  const [enabled, setEnabled] = useState(requireKey == null); // if no key required, always on
  const [proportionalEnabled, setProportionalEnabled] = useState(
    proportionalEnabledProp,
  );
  const [radiusWorld, setRadiusWorld] = useState(proportionalRadius);

  const prevPivotWorld = useRef(new THREE.Vector3());
  const dragStartPivotWorld = useRef(new THREE.Vector3());
  const tmpV = useMemo(() => new THREE.Vector3(), []);

  // --- key handling (toggles visibility/interaction)
  useEffect(() => {
    if (!requireKey) {
      setEnabled(true);
      return;
    }

    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === requireKey.toLowerCase()) setEnabled(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === requireKey.toLowerCase()) setEnabled(false);
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [requireKey]);

  function computeSelectionCentroidWorld(): THREE.Vector3 | null {
    const centroid = new THREE.Vector3();
    let n = 0;
    const p = new THREE.Vector3();

    for (const entry of registry.entries()) {
      const selected = entry.getSelected();
      if (!selected.length) continue;

      const geom = entry.points.geometry as THREE.BufferGeometry;
      const pos = geom.getAttribute("position") as THREE.BufferAttribute;
      if (!pos) continue;

      for (const i of selected) {
        p.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        p.applyMatrix4(entry.points.matrixWorld);
        centroid.add(p);
        n++;
      }
    }

    if (n === 0) return null;
    return centroid.multiplyScalar(1 / n);
  }

  // --- keep pivot at centroid when selection changes or when enabling
  useEffect(() => {
    if (!enabled) return;

    const center = computeSelectionCentroidWorld();
    if (!center) return;

    pivot.position.copy(center);
    prevPivotWorld.current.copy(center);

    // Force transform controls to refresh
    tcRef.current?.update?.();
  }, [enabled, registry, pivot]);

  // --- when gizmo moves, deform selected vertices by deltaWorld
  useEffect(() => {
    if (!enabled) return;
    const tc = tcRef.current;
    if (!tc) return;

    const onObjectChange = () => {
      // Get pivot position in WORLD space
      pivot.getWorldPosition(tmpV);

      const totalDeltaWorld = tmpV.clone().sub(dragStartPivotWorld.current);

      if (totalDeltaWorld.lengthSq() === 0) return;

      prevPivotWorld.current.copy(tmpV);

      for (const entry of registry.entries()) {
        entry.moveSelected(totalDeltaWorld);
      }
    };

    const onDraggingChanged = (e: any) => {
      const isDragging = !!e?.value;
      if (controlsRef?.current) controlsRef.current.enabled = !isDragging;
      // prevent OrbitControls / pointer conflicts
      gl.domElement.style.cursor = isDragging ? "grabbing" : "default";

      if (isDragging) {
        pivot.getWorldPosition(tmpV);
        prevPivotWorld.current.copy(tmpV);
        dragStartPivotWorld.current.copy(tmpV);

        for (const entry of registry.entries()) {
          entry.beginMove?.({
            pivotWorld: tmpV,
            proportionalEnabled,
            proportionalRadiusWorld: radiusWorld,
            falloff,
          });
        }
      } else {
        for (const entry of registry.entries()) {
          entry.endMove?.();
        }
      }
    };

    tc.addEventListener("objectChange", onObjectChange);
    tc.addEventListener("dragging-changed", onDraggingChanged);

    return () => {
      tc.removeEventListener("objectChange", onObjectChange);
      tc.removeEventListener("dragging-changed", onDraggingChanged);
    };
  }, [
    enabled,
    registry,
    pivot,
    tmpV,
    controlsRef,
    gl,
    proportionalEnabled,
    radiusWorld,
    falloff,
  ]);

  // Toggle proportional editing with "o"
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "o") {
        setProportionalEnabled((v) => {
          console.log(!v);
          return !v;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Mouse wheel adjusts proportional radius while tool is enabled
  useEffect(() => {
    if (!enabled) return;

    const onWheel = (e: WheelEvent) => {
      if (!proportionalEnabled) return;
      e.preventDefault();
      const dir = Math.sign(e.deltaY);
      setRadiusWorld((r) => {
        const next = r * (dir > 0 ? 0.9 : 1.1);
        console.log(Math.min(Math.max(next, 0.001), 1000));
        return Math.min(Math.max(next, 0.001), 1000);
      });
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel as any);
  }, [enabled, proportionalEnabled]);

  // No selection? no gizmo.
  const hasAnySelection = registry
    .entries()
    .some((e) => e.getSelected().length);

  if (!enabled || !hasAnySelection) return null;

  return (
    <>
      {/* pivot must be in the scene graph for TransformControls to work */}
      <primitive object={pivot} />

      <TransformControls
        ref={tcRef}
        object={pivot}
        camera={camera}
        domElement={gl.domElement}
        mode={mode}
        // keep on layer 0 so your raycaster.layers.set(0) still works
        onUpdate={(o) => o.traverse((child: any) => child.layers?.set?.(0))}
      />
    </>
  );
}
