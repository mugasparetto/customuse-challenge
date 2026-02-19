"use client";

import * as THREE from "three";
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

export default function Home() {
  return (
    <div style={{ width: "100%", height: "100vh", background: "#2b2b2b" }}>
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
        {/* Camera like a comfortable viewport framing */}
        <PerspectiveCamera makeDefault position={[3.2, 2.2, 3.2]} fov={45} />

        {/* Blender-ish neutral world */}
        <color attach="background" args={["#2e2f31"]} />
        <fog attach="fog" args={["#2e2f31", 12, 40]} />

        {/* Key / fill / rim (soft, neutral) */}
        <Lights />

        {/* Floor grid (Blender vibe) */}
        <Grid
          infiniteGrid
          fadeDistance={40}
          fadeStrength={1.2}
          cellSize={0.1}
          cellThickness={0.6}
          sectionSize={1}
          sectionThickness={1.25}
          // Colors: subtle light lines on dark grey background
          cellColor={"#3f4146"}
          sectionColor={"#5a5d64"}
        />

        {/* Soft "viewport" ground shadow */}
        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.45}
          scale={14}
          blur={2.2}
          far={12}
          resolution={1024}
          color="#000000"
        />

        {/* A subtle studio environment to mimic viewport reflections */}
        <Environment preset="studio" intensity={0.7} />

        {/* Put models here */}
        <Showcase />

        {/* Controls that feel like viewport orbit */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.6}
          zoomSpeed={0.9}
          panSpeed={0.7}
          minDistance={0.6}
          maxDistance={25}
          // Blender-ish: no auto-rotate, allow panning
        />

        {/* Small axis gizmo like viewport orientation widget */}
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
      {/* Soft key */}
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

      {/* Fill */}
      <directionalLight position={[-6, 3.5, -2]} intensity={1.0} />

      {/* Rim-ish */}
      <directionalLight position={[0, 4, -8]} intensity={0.6} />

      {/* Ambient base (Blender viewport has a gentle base light) */}
      <ambientLight intensity={0.25} />
    </>
  );
}

function Showcase() {
  return (
    <Center position={[0, 0.9, 0]}>
      {/* Replace this with your model(s).
          Keep castShadow/receiveShadow on meshes for the viewport feel. */}
      <mesh castShadow receiveShadow>
        <torusKnotGeometry args={[0.55, 0.18, 160, 18]} />
        <meshStandardMaterial
          color="#c9ccd2"
          metalness={0.15}
          roughness={0.35}
        />
      </mesh>
    </Center>
  );
}
