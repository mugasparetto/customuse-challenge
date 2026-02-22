"use client";

import * as THREE from "three";
import { useEffect, useMemo, useState, useRef } from "react";
import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  PerspectiveCamera,
  Center,
} from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SelectionProvider, useSelectionRegistry } from "./hooks/selection";
import BoxSelect from "./components/box-select";
import MoveSelected from "./components/move-selected";

type LoadedRoot = THREE.Object3D | null;

export default function Viewer() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const orbitRef = useRef<any>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Drag & drop handler
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      const lower = file.name.toLowerCase();
      const ok = lower.endsWith(".glb") || lower.endsWith(".gltf");
      if (!ok) return;

      const url = URL.createObjectURL(file);
      setFileName(file.name);
      setFileUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <div style={{ width: "100%", height: "100vh", background: "#2b2b2b" }}>
      {/* HUD */}
      <div className="absolute top-3 left-3 z-10 p-3 rounded-lg bg-black/45 text-white text-sm font-sans pointer-events-auto user-select-none">
        <span className="block">
          <strong>drag & drop .glb/.gltf</strong>
        </span>
        <span className="block opacity-80">
          {fileUrl ? `loaded: ${fileName}` : "no model loaded yet"}
        </span>
      </div>

      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50"
      />

      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{
          antialias: true,
          physicallyCorrectLights: true,
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        onCreated={({ raycaster }) => {
          // Only pick objects on layer 0
          raycaster.layers.set(0);

          // Helps clicking small vertices
          raycaster.params.Points = raycaster.params.Points ?? {};
          (raycaster.params.Points as any).threshold = 0.02;
        }}
        onPointerMissed={() => {
          // we'll trigger a custom DOM event so every vertex component clears
          window.dispatchEvent(new Event("clear-vertex-selection"));
        }}
      >
        <SelectionProvider>
          <PerspectiveCamera
            makeDefault
            position={[3.2, 2.2, 3.2]}
            fov={45}
            onUpdate={(cam) => {
              cam.layers.enable(0);
              cam.layers.enable(1); // <-- makes overlay visible again
            }}
          />

          <color attach="background" args={["#2e2f31"]} />
          <fog attach="fog" args={["#2e2f31", 12, 40]} />

          <Lights />

          <Grid
            infiniteGrid
            fadeDistance={18}
            fadeStrength={1.2}
            cellSize={0.1}
            cellThickness={0.6}
            sectionSize={1}
            sectionThickness={1.25}
            cellColor={"#3f4146"}
            sectionColor={"#5a5d64"}
          />

          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.45}
            scale={14}
            blur={2.2}
            far={12}
            resolution={1024}
            color="#000000"
          />

          <Environment preset="studio" intensity={0.7} />

          <Center position={[0, 0.9, 0]}>
            {fileUrl ? (
              <DroppedModel url={fileUrl} />
            ) : (
              <mesh castShadow receiveShadow>
                <torusKnotGeometry args={[0.55, 0.18, 160, 18]} />
                <meshStandardMaterial
                  color="#c9ccd2"
                  metalness={0.15}
                  roughness={0.35}
                />
              </mesh>
            )}
          </Center>

          <OrbitControls
            ref={orbitRef}
            makeDefault
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.6}
            zoomSpeed={0.9}
            panSpeed={0.7}
            minDistance={0.6}
            maxDistance={25}
          />

          <BoxSelect
            controlsRef={orbitRef}
            overlayRef={overlayRef}
            requireKey="b"
          />

          <MoveSelected controlsRef={orbitRef} requireKey="g" />

          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport
              axisColors={["#ff4d4d", "#4dff4d", "#4da6ff"]}
              labelColor="white"
            />
          </GizmoHelper>
        </SelectionProvider>
      </Canvas>
    </div>
  );
}

function Lights() {
  return (
    <>
      <directionalLight
        castShadow
        position={[4, 6, 3]}
        intensity={2.2}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight position={[-6, 3.5, -2]} intensity={1.0} />
      <directionalLight position={[0, 4, -8]} intensity={0.6} />
      <ambientLight intensity={0.25} />
    </>
  );
}

function DroppedModel({ url }: { url: string }) {
  const loader = useMemo(() => new GLTFLoader(), []);
  const [root, setRoot] = useState<LoadedRoot>(null);

  useEffect(() => {
    let cancelled = false;

    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;

        const scene = gltf.scene.clone(true);

        scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            const m = o as THREE.Mesh;
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });

        fitToUnit(scene, 1.6);
        setRoot(scene);
      },
      undefined,
      (err) => console.error("GLTF load error:", err),
    );

    return () => {
      cancelled = true;
    };
  }, [url, loader]);

  const meshes = useMemo(() => {
    if (!root) return [];
    const arr: THREE.Mesh[] = [];
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        if (m.geometry?.attributes?.position) arr.push(m);
      }
    });
    return arr;
  }, [root]);

  if (!root) return null;

  return (
    <group>
      <primitive object={root} />
      {meshes.map((m) => (
        <SelectableVertices
          key={m.uuid}
          mesh={m}
          pointSize={0.02}
          makeNonIndexed={false}
          disableMeshRaycast
        />
      ))}
    </group>
  );
}

type Props = {
  mesh: THREE.Mesh;
  pointSize?: number;
  makeNonIndexed?: boolean;
  // colors
  baseColor?: THREE.ColorRepresentation;
  selectedColor?: THREE.ColorRepresentation;
  // if true, disables raycast on the original mesh so you always pick points
  disableMeshRaycast?: boolean;
};

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

      moveSelected: (deltaWorld: THREE.Vector3) => {
        const geom = mesh.geometry as THREE.BufferGeometry;
        const pos = geom.getAttribute("position") as THREE.BufferAttribute;
        if (!pos) return;

        const start = dragStartPositionsRef.current;
        const opts = dragOptsRef.current;

        // Fallback: if we missed drag start, behave like before
        if (!start || !opts || !opts.proportionalEnabled) {
          const tmp = new THREE.Vector3();
          for (const i of selectedRef.current) {
            tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).add(deltaWorld);
            pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
          }
        } else {
          // world->local scale approximation so radius feels consistent in world units
          const m = mesh.matrixWorld.elements;
          const sx = Math.hypot(m[0], m[1], m[2]);
          const sy = Math.hypot(m[4], m[5], m[6]);
          const sz = Math.hypot(m[8], m[9], m[10]);
          const sAvg = (sx + sy + sz) / 3;

          const radiusLocal = opts.radiusWorld / Math.max(sAvg, 1e-8);
          const rInv = 1 / Math.max(radiusLocal, 1e-8);

          const pivotLocal = dragPivotLocalRef.current;
          const selSet = new Set<number>(selectedRef.current);

          const falloff = (t: number) => {
            if (t <= 0) return 1;
            if (t >= 1) return 0;

            if (opts.falloff === "sharp") {
              const x = 1 - t;
              return x * x * x * x;
            }

            if (opts.falloff === "gaussian") {
              const sharpness = 3;
              const a = Math.exp(-sharpness * t * t);
              const edge = Math.exp(-sharpness);
              return (a - edge) / (1 - edge); // normalized to hit 0 at edge
            }

            // smooth (default)
            const x = 1 - t;
            return x * x * (3 - 2 * x);
          };

          const arr = pos.array as Float32Array;

          for (let i = 0; i < pos.count; i++) {
            const ix = i * 3;
            const sx0 = start[ix + 0];
            const sy0 = start[ix + 1];
            const sz0 = start[ix + 2];

            let w = selSet.has(i) ? 1 : 0;

            if (w === 0) {
              const vx = sx0 - pivotLocal.x;
              const vy = sy0 - pivotLocal.y;
              const vz = sz0 - pivotLocal.z;
              const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
              if (d < radiusLocal) w = falloff(d * rInv);
            }

            arr[ix + 0] = sx0 + deltaWorld.x * w;
            arr[ix + 1] = sy0 + deltaWorld.y * w;
            arr[ix + 2] = sz0 + deltaWorld.z * w;
          }
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

  // clear selection on global event (your page.tsx emits this)
  useEffect(() => {
    const onClear = () => setSelectedIndices([]);
    window.addEventListener("clear-vertex-selection", onClear);
    return () => window.removeEventListener("clear-vertex-selection", onClear);
  }, []);

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

function fitToUnit(object3D: THREE.Object3D, targetSize = 1.6) {
  const box = new THREE.Box3().setFromObject(object3D);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;

  object3D.position.sub(center);
  object3D.scale.setScalar(scale);

  const box2 = new THREE.Box3().setFromObject(object3D);
  const minY = box2.min.y;
  object3D.position.y -= minY;
}

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
  const invParent = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const localMat = new THREE.Matrix4().multiplyMatrices(
    invParent,
    target.matrixWorld,
  );

  localMat.decompose(obj.position, obj.quaternion, obj.scale);
}
