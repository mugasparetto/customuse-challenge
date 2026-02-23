# Customuse Challenge

A simple, browser-based mesh deformation tool built with **Next.js + React Three Fiber + drei**.

You can drag & drop a `.glb` / `.gltf`, select vertices (click / box select), and **move** them with a transform gizmo. Optionally, you can enable **proportional editing** (soft selection) with an adjustable radius + falloff.

## Requirements

A browser-based Three.js application where a user can:

- Load a provided GLB model into a 3D viewport
- Place one or more influence points on the mesh surface
- Adjust the radius of influence for each point
- Drag the influence point to deform the mesh in real time, with smooth falloff
- Export the deformed mesh as a GLB file

## Demo
<video src="https://github.com/user-attachments/assets/fb3034d7-903e-4981-8d02-d438910bd3c2"></video>

## How to use the app

- Drag and drop any GLB model into the canvas
- Camera controls: Right click to rotate, left click to pan and mouse wheel to zoom
- Select vertices by clicking on them
- Select multiple vertices by SHIFT + clicking them
- Box select vertices by pressing and holding B and click + drag some area
- Press and hold G to enable the TransformControl
- Hold and drag the TransformControl axis to deform the mesh
- Toggle Proportional Editing by pressing O - a circle will appear at the TransformControl pivot if the feature is enabled
- Increase or decrease the Proportional Editing radius by scrolling the mouse wheel up/down
- Download the deformed mesh by clicking the "download deformed mesh" button

## Setup and installation instructions

### Clone the project

```bash
$ git clone https://github.com/mugasparetto/customuse-challenge && cd customuse-challenge
```

### Run these commands

```bash
# Install the dependencies
$ npm install

# Run the web client
$ npm run dev
```

### Using example models

In `./example-models`, you can find the GLB versions of the FBX models provided: headphones and wings.

## Skinning / deformation math (what happens when the user drags?)

### The core approach

This tool is not doing GPU skinning math or bone-weight recomputation during editing. Instead, it performs direct geometry editing:

1. **TransformControls** moves a pivot in world space.

2. We compute the **world-space translation delta** from drag start:

   `deltaWorld = pivotWorldNow - pivotWorldAtDragStart`

3. For each affected mesh, we convert that world delta into a mesh-local delta:
   - take the inverse world matrix
   - use its 3×3 (rotation + scale) part
   - apply it to the delta vector

   Conceptually:

   `deltaLocal = (inverse(meshWorld) rotational+scale part) * deltaWorld`
   (Translation is ignored because we’re converting a direction/offset, not a point.)

4. We apply deltaLocal to vertex positions:
   - either only selected vertices (non-proportional)
   - or all vertices with a falloff weight (proportional)

5. We mark positions dirty and recompute:
   - bounding box / sphere
   - normals

## Tradeoffs & limitations

### Geometry + performance

- Recomputing normals and bounds on every drag update is simple and gives correct shading, but can be expensive on dense meshes.
- Box selection projects every vertex to screen space; large meshes will feel slow.

### Editing model topology

- This edits raw vertex positions only.
- No weld/merge, no topology changes, no constraints, no snapping.

### Transform limitations

- The move tool is configured as translate by default.
- Rotate/scale modes exist in props, but the deformation logic currently treats the transform as a translation delta (no rotation/scale deformation).

### Proportional radius scaling

- The radius conversion uses an average world scale approximation.
- Non-uniform scaling can make the influence feel slightly “off” in some axes.

### Skinned meshes

- No per-vertex skinning evaluation / baking.
- Export avoids baking transforms for SkinnedMesh, so “exported result equals viewport result” is not guaranteed in skinned/animated cases.

### No undo/redo

- Vertex edits are destructive in-session. Refresh resets.

---

Made with 💜 &nbsp;by Murilo Gasparetto 👋 &nbsp;[Get in touch](https://www.linkedin.com/in/mugasparetto/)
