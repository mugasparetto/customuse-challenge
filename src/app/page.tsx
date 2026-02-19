"use client";

import * as THREE from "three";
import React, { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Environment,
  OrbitControls,
  Grid,
  ContactShadows,
  GizmoHelper,
  GizmoViewport,
  PerspectiveCamera,
  Center,
} from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export default function Home() {
  const [fileUrl, setFileUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [showVertices, setShowVertices] = useState(true);

  useEffect(() => {
    const onDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };

    const onDrop = (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".glb") && !lower.endsWith(".gltf")) return;

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

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showVertices}
            onChange={(e) => setShowVertices(e.target.checked)}
          />
          <span>show vertices</span>
        </label>
      </div>

      <Canvas
        shadows
        gl={{
          antialias: true,
          physicallyCorrectLights: true,
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        dpr={[1, 2]}
      >
        <PerspectiveCamera makeDefault position={[3.2, 2.2, 3.2]} fov={45} />
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
            <DroppedModel url={fileUrl} showVertices={showVertices} />
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

        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />

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

function DroppedModel({ url, showVertices }) {
  const loader = useMemo(() => new GLTFLoader(), []);
  const [root, setRoot] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;

        const scene = gltf.scene.clone(true);

        // Enable shadows
        scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
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

  // Build vertex overlays once per loaded model
  const vertexOverlays = useMemo(() => {
    if (!root) return [];

    const overlays = [];

    root.updateWorldMatrix(true, true);

    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry?.attributes?.position) return;

      // Clone geometry (safe)
      const geom = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();

      // Create points object
      const points = new THREE.Points(
        geom,
        new THREE.PointsMaterial({
          size: 0.02,
          sizeAttenuation: true,
          color: "#ff00ff",
          depthWrite: false,
        }),
      );

      // 🔥 THIS IS THE IMPORTANT PART
      o.updateWorldMatrix(true, false);
      points.applyMatrix4(o.matrixWorld);

      overlays.push(<primitive key={o.uuid} object={points} />);
    });

    return overlays;
  }, [root]);

  if (!root) return null;

  return (
    <group>
      {/* shaded model */}
      <primitive object={root} />

      {/* vertex overlay */}
      {showVertices && (
        <group
        // Parenting the points under this group makes them inherit transforms.
        // Root is already transformed, so we render points in the same local space.
        >
          {vertexOverlays}
        </group>
      )}
    </group>
  );
}

/**
 * Centers object at origin, scales to target size, then puts on "floor" y=0.
 */
function fitToUnit(object3D, targetSize = 1.6) {
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
