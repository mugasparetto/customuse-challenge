"use client";

import * as THREE from "three";
import { useEffect, useMemo, useState, useRef, type RefObject } from "react";
import { Canvas } from "@react-three/fiber";
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
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { SelectionProvider, useSelectionRegistry } from "./hooks/selection";
import BoxSelect from "./components/box-select";
import MoveSelected from "./components/move-selected";
import { SelectableVertices } from "./components/selectable-vertices";

type LoadedRoot = THREE.Object3D | null;

export default function Viewer() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const loadedRootRef = useRef<THREE.Object3D | null>(null);

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

  function downloadDeformedMesh() {
    const root = loadedRootRef.current;
    if (!root) return;

    // Ensure matrices are up to date (important before baking)
    root.updateWorldMatrix(true, true);

    // Collect ONLY meshes from the loaded GLTF root
    const exportGroup = new THREE.Group();
    exportGroup.name = "deformed";

    root.traverse((obj) => {
      const anyObj = obj as any;

      if (anyObj.isMesh || anyObj.isSkinnedMesh) {
        const mesh = obj as THREE.Mesh;

        // Clone geometry so we export the deformed state
        const srcGeom = mesh.geometry as THREE.BufferGeometry | undefined;
        if (!srcGeom?.attributes?.position) return;

        const isSkinned = (mesh as any).isSkinnedMesh === true;

        // IMPORTANT:
        // - For regular Mesh: bake world transform into geometry so exported file matches what you see
        // - For SkinnedMesh: baking like this usually breaks skinning. We export it without baking.
        const geom = srcGeom.clone();

        if (!isSkinned) {
          geom.applyMatrix4(mesh.matrixWorld);
        }

        // Materials: keep as-is (clone optional)
        const mat = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : mesh.material.clone();

        const outMesh = new THREE.Mesh(geom, mat);
        outMesh.name = mesh.name || "mesh";

        // If not baked (skinned), preserve transform; if baked, identity is correct
        if (isSkinned) {
          outMesh.position.copy(mesh.getWorldPosition(new THREE.Vector3()));
          outMesh.quaternion.copy(
            mesh.getWorldQuaternion(new THREE.Quaternion()),
          );
          outMesh.scale.copy(mesh.getWorldScale(new THREE.Vector3()));
        } else {
          outMesh.position.set(0, 0, 0);
          outMesh.quaternion.identity();
          outMesh.scale.set(1, 1, 1);
        }

        // Copy a couple useful flags
        outMesh.castShadow = false;
        outMesh.receiveShadow = false;

        exportGroup.add(outMesh);
      }
    });

    // Export to GLB
    const exporter = new GLTFExporter();
    exporter.parse(
      exportGroup,
      (result) => {
        const base =
          (fileName?.replace(/\.(glb|gltf)$/i, "") || "model") +
          "_deformed.glb";

        if (result instanceof ArrayBuffer) {
          const blob = new Blob([result], { type: "model/gltf-binary" });
          const url = URL.createObjectURL(blob);

          const a = document.createElement("a");
          a.href = url;
          a.download = base;
          document.body.appendChild(a);
          a.click();
          a.remove();

          URL.revokeObjectURL(url);
        } else {
          // (Shouldn't happen because we request binary: true)
          const json = JSON.stringify(result);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);

          const a = document.createElement("a");
          a.href = url;
          a.download = base.replace(/\.glb$/i, ".gltf");
          document.body.appendChild(a);
          a.click();
          a.remove();

          URL.revokeObjectURL(url);
        }
      },
      (err) => console.error("GLTF export error:", err),
      {
        binary: true,
        // embedImages: true, // optional
        // onlyVisible: true, // optional
        // truncateDrawRange: true, // optional
      },
    );
  }

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

        {fileUrl && (
          <button
            className="mt-2 px-3 py-1 rounded bg-white/15 hover:bg-white/25 disabled:opacity-40"
            onClick={downloadDeformedMesh}
            type="button"
          >
            download deformed mesh (.glb)
          </button>
        )}
      </div>

      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50"
      />

      <SelectionProvider>
        <ViewerCanvas
          fileUrl={fileUrl}
          orbitRef={orbitRef}
          overlayRef={overlayRef}
          onRoot={(r) => {
            loadedRootRef.current = r;
          }}
        />
      </SelectionProvider>
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

function DroppedModel({
  url,
  onRoot,
}: {
  url: string;
  onRoot?: (root: THREE.Object3D | null) => void;
}) {
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
        onRoot?.(scene);
      },
      undefined,
      (err) => console.error("GLTF load error:", err),
    );

    return () => {
      cancelled = true;
      onRoot?.(null);
    };
  }, [url, loader, onRoot]);

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

function ViewerCanvas({
  fileUrl,
  orbitRef,
  overlayRef,
  onRoot,
}: {
  fileUrl: string | null;
  orbitRef: RefObject<any>;
  overlayRef: RefObject<HTMLDivElement | null>;
  onRoot?: (root: THREE.Object3D | null) => void;
}) {
  const registry = useSelectionRegistry();

  return (
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
        raycaster.params.Points.threshold = 0.02;
      }}
      onPointerMissed={() => {
        registry.clearAllSelections();
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
        {fileUrl && <DroppedModel url={fileUrl} onRoot={onRoot} />}
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
    </Canvas>
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
