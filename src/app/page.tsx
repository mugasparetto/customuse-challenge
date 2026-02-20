"use client";

import * as THREE from "three";
import { useEffect, useMemo, useState, useRef } from "react";
import { Canvas, ThreeEvent } from "@react-three/fiber";
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

type LoadedRoot = THREE.Object3D | null;

export default function Viewer() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

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
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          padding: "10px 12px",
          borderRadius: 10,
          background: "rgba(0,0,0,0.45)",
          color: "white",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          fontSize: 13,
          pointerEvents: "auto",
          userSelect: "none",
        }}
      >
        <div style={{ fontWeight: 700 }}>drag & drop .glb/.gltf</div>
        <div style={{ opacity: 0.85, marginBottom: 8 }}>
          {fileUrl ? `loaded: ${fileName}` : "no model loaded yet"}
        </div>

        <div style={{ opacity: 0.7, marginTop: 6 }}>
          click = select • shift+click = multi
        </div>
      </div>

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
          makeDefault
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.6}
          zoomSpeed={0.9}
          panSpeed={0.7}
          minDistance={0.6}
          maxDistance={25}
        />

        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={["#ff4d4d", "#4dff4d", "#4da6ff"]}
            labelColor="white"
          />
        </GizmoHelper>
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
          makeNonIndexed
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

export function SelectableVertices({
  mesh,
  pointSize = 0.008,
  makeNonIndexed = true,
  disableMeshRaycast = true,
}: Props) {
  const pointsRef = useRef<THREE.Points | null>(null);

  // ✅ render-driving state
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  const clearSelection = () => setSelectedIndices([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onClear = () => clearSelection();
    window.addEventListener("clear-vertex-selection", onClear);
    return () => window.removeEventListener("clear-vertex-selection", onClear);
  }, []);

  // Build points geometry (world baked, constant color)
  const pointsObj = useMemo(() => {
    mesh.updateWorldMatrix(true, false);

    const src = mesh.geometry as THREE.BufferGeometry;
    const g = makeNonIndexed && src.index ? src.toNonIndexed() : src.clone();

    g.applyMatrix4(mesh.matrixWorld);
    g.computeBoundingSphere();

    const mat = new THREE.PointsMaterial({
      size: pointSize,
      sizeAttenuation: true,
      color: 0xff00ff,
      depthTest: true,
      transparent: true,
      opacity: 0.95,
    });
    mat.toneMapped = false;

    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;

    return pts;
  }, [mesh, makeNonIndexed, pointSize]);

  // Disable mesh raycast so you can always click points
  useEffect(() => {
    if (!disableMeshRaycast) return;
    const oldRaycast = mesh.raycast;
    // @ts-expect-error
    mesh.raycast = () => null;
    return () => {
      mesh.raycast = oldRaycast;
    };
  }, [mesh, disableMeshRaycast]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const idx = (e as any).index as number | undefined;
    if (idx == null) return;

    const multi = e.nativeEvent.shiftKey;

    setSelectedIndices((prev) => {
      if (!multi) {
        // ✅ single click replaces selection
        return [idx];
      }
      // ✅ shift+click toggles
      if (prev.includes(idx)) return prev.filter((x) => x !== idx);
      return [...prev, idx];
    });
  };

  return (
    <>
      {/* pickable vertex cloud on layer 0 */}
      <primitive
        object={pointsObj}
        ref={(o) => (pointsRef.current = o as unknown as THREE.Points)}
        onPointerDown={onPointerDown}
        onUpdate={(o) => o.layers.set(0)}
      />

      {/* visible overlay on layer 1 (not pickable) */}
      {pointsRef.current && selectedIndices.length > 0 && (
        <SelectedVertexOverlay
          sourcePoints={pointsRef.current}
          indices={selectedIndices}
          size={pointSize * 1.5}
        />
      )}
    </>
  );
}

function SelectedVertexOverlay({
  sourcePoints,
  indices,
  size,
}: {
  sourcePoints: THREE.Points;
  indices: number[];
  size: number;
}) {
  const geom = useMemo(() => {
    const srcGeom = sourcePoints.geometry as THREE.BufferGeometry;
    const pos = srcGeom.getAttribute("position") as THREE.BufferAttribute;

    const positions = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      positions[i * 3 + 0] = pos.getX(idx);
      positions[i * 3 + 1] = pos.getY(idx);
      positions[i * 3 + 2] = pos.getZ(idx);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.computeBoundingSphere();
    return g;
  }, [sourcePoints, indices]);

  return (
    <points
      geometry={geom}
      frustumCulled={false}
      onUpdate={(o) => o.layers.set(1)}
      raycast={() => null}
    >
      <pointsMaterial
        size={size}
        sizeAttenuation
        color="#ffff00"
        depthTest={false}
        transparent
        opacity={1}
        toneMapped={false}
      />
    </points>
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
