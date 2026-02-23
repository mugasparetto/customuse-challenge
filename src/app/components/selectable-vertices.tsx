"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { ThreeEvent, useFrame } from "@react-three/fiber";

import { useSelectionRegistry } from "../hooks/selection";
import {
  computeDeltaLocal,
  applyNonProportionalMove,
  applyProportionalMove,
} from "../helpers/vertex-edit";

type SVProps = {
  mesh: THREE.Mesh;
  pointSize?: number;
  makeNonIndexed?: boolean;
  /** If true, mesh won't intercept pointer events (so points get clicks) */
  disableMeshRaycast?: boolean;
};

export function SelectableVertices({
  mesh,
  pointSize = 0.01,
  makeNonIndexed = false,
  disableMeshRaycast = true,
}: SVProps) {
  const pointsRef = useRef<THREE.Points | null>(null);

  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const selectedRef = useRef<number[]>([]);
  const [posVersion, setPosVersion] = useState(0);

  // Drag snapshot for proportional editing
  const dragStartPositionsRef = useRef<Float32Array | null>(null);
  const dragPivotLocalRef = useRef(new THREE.Vector3());
  const dragOptsRef = useRef<{
    proportionalEnabled: boolean;
    radiusWorld: number;
    falloff: "smooth" | "gaussian" | "sharp";
  } | null>(null);

  useEffect(() => {
    selectedRef.current = selectedIndices;
  }, [selectedIndices]);

  const editableGeometry = useMemo(() => {
    const src = mesh.geometry as THREE.BufferGeometry;

    // Convert to non-indexed ONLY if requested
    if (makeNonIndexed && src.index) {
      const nonIndexed = src.toNonIndexed();
      mesh.geometry = nonIndexed;
      return nonIndexed;
    }

    // Otherwise use the mesh's actual geometry reference
    return src;
  }, [mesh, makeNonIndexed]);

  // 2) Magenta points using the same geometry reference
  const pointsObj = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size: pointSize,
      sizeAttenuation: true,
      color: 0xff00ff,
      depthTest: true,
      transparent: true,
      opacity: 0.95,
    });
    mat.toneMapped = false;

    const pts = new THREE.Points(editableGeometry, mat);
    pts.frustumCulled = false;
    pts.matrixAutoUpdate = true; // we set TRS, not raw matrix
    return pts;
  }, [editableGeometry, pointSize]);

  // Dispose the PointsMaterial we create manually
  useEffect(() => {
    const mat = (pointsObj.material as THREE.Material | undefined) ?? null;
    return () => {
      mat?.dispose?.();
    };
  }, [pointsObj]);

  // 3) Optional: disable mesh raycast so clicks hit points
  useEffect(() => {
    if (!disableMeshRaycast) return;
    const oldRaycast = mesh.raycast;
    // @ts-expect-error
    mesh.raycast = () => null;
    return () => {
      mesh.raycast = oldRaycast;
    };
  }, [mesh, disableMeshRaycast]);

  // 4) IMPORTANT: sync points to mesh in *parent space* (not world space)
  useFrame(() => {
    const pts = pointsRef.current;
    if (!pts) return;
    syncToTargetInParentSpace(pts, mesh);
  });

  const registry = useSelectionRegistry();

  // 5) register in selection registry + implement deformation
  useEffect(() => {
    if (!pointsRef.current) return;

    const unregister = registry.register({
      id: mesh.uuid,
      points: pointsRef.current,
      setSelected: setSelectedIndices,
      getSelected: () => selectedRef.current,
      clearSelection: () => setSelectedIndices([]),

      moveSelected: (deltaWorld: THREE.Vector3) => {
        const geom = mesh.geometry as THREE.BufferGeometry;
        const pos = geom.getAttribute("position") as THREE.BufferAttribute;
        if (!pos) return;

        let start = dragStartPositionsRef.current;
        const opts = dragOptsRef.current;

        // Always interpret deltaWorld as "delta from drag start".
        // Ensure we have a snapshot even if beginMove() didn't run (e.g. missed drag start).
        if (!start) {
          start = (pos.array as Float32Array).slice();
          dragStartPositionsRef.current = start;
        }

        const deltaLocal = computeDeltaLocal(mesh, deltaWorld);
        // Non-proportional: only move selected vertices, based on the drag-start snapshot.
        if (!opts || !opts.proportionalEnabled) {
          applyNonProportionalMove(pos, start, selectedRef.current, deltaLocal);
        } else {
          // world->local scale approximation so radius feels consistent in world units
          applyProportionalMove({
            mesh,
            pos,
            start,
            selected: selectedRef.current,
            pivotLocal: dragPivotLocalRef.current,
            radiusWorld: opts.radiusWorld,
            falloff: opts.falloff,
            deltaLocal,
          });
        }

        pos.needsUpdate = true;
        geom.computeBoundingBox();
        geom.computeBoundingSphere();
        geom.computeVertexNormals();

        setPosVersion((v) => v + 1);
      },
      beginMove: ({
        pivotWorld,
        proportionalEnabled,
        proportionalRadiusWorld,
        falloff,
      }) => {
        const geom = mesh.geometry as THREE.BufferGeometry;
        const pos = geom.getAttribute("position") as THREE.BufferAttribute;
        if (!pos) return;

        // snapshot starting positions
        dragStartPositionsRef.current = (pos.array as Float32Array).slice();

        // pivot in local space (stable for distance checks)
        mesh.updateWorldMatrix(true, false);
        const pivotLocal = pivotWorld.clone();
        mesh.worldToLocal(pivotLocal);
        dragPivotLocalRef.current.copy(pivotLocal);

        dragOptsRef.current = {
          proportionalEnabled,
          radiusWorld: proportionalRadiusWorld,
          falloff,
        };
      },

      endMove: () => {
        // finalize shading once per drag
        const geom = mesh.geometry as THREE.BufferGeometry;
        geom.computeVertexNormals();

        dragStartPositionsRef.current = null;
        dragOptsRef.current = null;
      },
    });

    return unregister;
  }, [registry, mesh]);

  // 6) click to select
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();

    const idx = (e as any).index as number | undefined;
    if (idx == null) return;

    const multi = e.nativeEvent.shiftKey;

    setSelectedIndices((prev) => {
      if (!multi) return [idx];
      if (prev.includes(idx)) return prev.filter((x) => x !== idx);
      return [...prev, idx];
    });
  };

  return (
    <>
      <primitive
        ref={pointsRef as any}
        object={pointsObj}
        onPointerDown={onPointerDown}
      />

      {pointsRef.current && selectedIndices.length > 0 && (
        <SelectedVertexOverlay
          sourcePoints={pointsRef.current}
          indices={selectedIndices}
          size={pointSize * 1.5}
          posVersion={posVersion}
        />
      )}
    </>
  );
}

type OverlayProps = {
  sourcePoints: THREE.Points;
  indices: number[];
  size: number;
  /** increment this when base geometry positions change so overlay rebuilds */
  posVersion?: number;
};

export function SelectedVertexOverlay({
  sourcePoints,
  indices,
  size,
  posVersion = 0,
}: OverlayProps) {
  const overlayRef = useRef<THREE.Points | null>(null);

  const geom = useMemo(() => new THREE.BufferGeometry(), []);
  const mat = useMemo(() => {
    const m = new THREE.PointsMaterial({
      size,
      sizeAttenuation: true,
      color: 0xffff00,
      depthTest: true,
      transparent: true,
      opacity: 1,
    });
    m.toneMapped = false;
    return m;
  }, [size]);

  useEffect(() => {
    return () => {
      geom.dispose();
      mat.dispose();
    };
  }, [geom, mat]);

  // Build overlay positions in LOCAL space of sourcePoints.geometry
  useEffect(() => {
    const srcGeom = sourcePoints.geometry as THREE.BufferGeometry;
    const pos = srcGeom.getAttribute("position") as THREE.BufferAttribute;
    if (!pos) return;

    const out = new Float32Array(indices.length * 3);
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      out[k * 3 + 0] = pos.getX(i);
      out[k * 3 + 1] = pos.getY(i);
      out[k * 3 + 2] = pos.getZ(i);
    }

    geom.setAttribute("position", new THREE.BufferAttribute(out, 3));
    geom.attributes.position.needsUpdate = true;
    geom.computeBoundingSphere();
  }, [geom, sourcePoints, indices, posVersion]);

  // Align overlay to sourcePoints in *parent space*
  useFrame(() => {
    const o = overlayRef.current;
    if (!o) return;
    syncToTargetInParentSpace(o, sourcePoints);
  });

  return (
    <points
      ref={overlayRef as any}
      geometry={geom}
      material={mat}
      frustumCulled={false}
    />
  );
}

const _syncInvParent = new THREE.Matrix4();
const _syncLocalMat = new THREE.Matrix4();

function syncToTargetInParentSpace(
  obj: THREE.Object3D,
  target: THREE.Object3D,
) {
  const parent = obj.parent;
  if (!parent) return;

  // Ensure matrices are current
  parent.updateWorldMatrix(true, false);
  target.updateWorldMatrix(true, false);

  // localMatrix = inverse(parentWorld) * targetWorld
  _syncInvParent.copy(parent.matrixWorld).invert();
  _syncLocalMat.multiplyMatrices(_syncInvParent, target.matrixWorld);

  _syncLocalMat.decompose(obj.position, obj.quaternion, obj.scale);
}
