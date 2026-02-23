"use client";

import React, { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSelectionRegistry } from "../hooks/selection"; // adjust

export default function BoxSelect({
  controlsRef,
  overlayRef,
  requireKey = "b",
}: {
  controlsRef?: React.RefObject<{ enabled: boolean } | null>;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  requireKey?: string | null;
}) {
  const { gl, camera, size } = useThree();
  const registry = useSelectionRegistry();

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const keyDownRef = useRef(false);
  const boxElRef = useRef<HTMLDivElement | null>(null);
  const baseRectRef = useRef<DOMRect | null>(null);

  // Create the DOM rectangle once
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.border = "1px solid rgba(255,255,255,0.9)";
    el.style.background = "rgba(255,255,255,0.08)";
    el.style.display = "none";
    overlay.appendChild(el);

    boxElRef.current = el;
    return () => {
      el.remove();
      boxElRef.current = null;
    };
  }, [overlayRef]);

  // Optional requireKey handling
  useEffect(() => {
    if (!requireKey) return;
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === requireKey.toLowerCase())
        keyDownRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === requireKey.toLowerCase())
        keyDownRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [requireKey]);

  useEffect(() => {
    const canvasEl = gl.domElement;
    const boxEl = boxElRef.current;
    if (!boxEl) return;

    const getMouse = (ev: PointerEvent) => {
      // Use the overlay rect because the box is drawn in overlay coordinates
      const r =
        baseRectRef.current ??
        overlayRef.current?.getBoundingClientRect() ??
        canvasEl.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };

    const setBox = (x: number, y: number, w: number, h: number) => {
      boxEl.style.left = `${x}px`;
      boxEl.style.top = `${y}px`;
      boxEl.style.width = `${w}px`;
      boxEl.style.height = `${h}px`;
      boxEl.style.display = w > 0 && h > 0 ? "block" : "none";
    };

    const clearBox = () => {
      boxEl.style.display = "none";
    };

    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      if (requireKey && !keyDownRef.current) return;

      // lock rect base to prevent drift if scroll/layout changes mid-drag
      baseRectRef.current =
        overlayRef.current?.getBoundingClientRect() ??
        canvasEl.getBoundingClientRect();

      startRef.current = getMouse(ev);
      setBox(startRef.current.x, startRef.current.y, 0, 0);

      if (controlsRef?.current) controlsRef.current.enabled = false;
      (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    };

    const onMove = (ev: PointerEvent) => {
      if (!startRef.current) return;

      const p = getMouse(ev);
      const s = startRef.current;

      const x1 = Math.min(s.x, p.x);
      const y1 = Math.min(s.y, p.y);
      const x2 = Math.max(s.x, p.x);
      const y2 = Math.max(s.y, p.y);

      setBox(x1, y1, x2 - x1, y2 - y1);
    };

    const onUp = () => {
      const start = startRef.current;
      if (!start) return;

      // read final box from styles
      const left = parseFloat(boxEl.style.left || "0");
      const top = parseFloat(boxEl.style.top || "0");
      const w = parseFloat(boxEl.style.width || "0");
      const h = parseFloat(boxEl.style.height || "0");

      // capture base rect once (prevents drift if layout/scroll changes)
      const r =
        baseRectRef.current ??
        overlayRef.current?.getBoundingClientRect() ??
        gl.domElement.getBoundingClientRect();

      startRef.current = null;
      clearBox();
      if (controlsRef?.current) controlsRef.current.enabled = true;

      // drop zero-sized drags
      if (!r || w < 2 || h < 2) {
        baseRectRef.current = null;
        return;
      }

      const right = left + w;
      const bottom = top + h;

      const tmp = new THREE.Vector3();

      for (const entry of registry.entries()) {
        const geom = entry.points.geometry as THREE.BufferGeometry;
        const pos = geom.getAttribute("position") as THREE.BufferAttribute;
        if (!pos) continue;

        const picked: number[] = [];
        for (let i = 0; i < pos.count; i++) {
          tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i));
          tmp.applyMatrix4(entry.points.matrixWorld); // convert to world
          tmp.project(camera);

          const sx = (tmp.x * 0.5 + 0.5) * r.width;
          const sy = (-tmp.y * 0.5 + 0.5) * r.height;

          if (sx >= left && sx <= right && sy >= top && sy <= bottom)
            picked.push(i);
        }

        entry.setSelected(picked);
      }

      // clear after selection is computed
      baseRectRef.current = null;
    };

    canvasEl.addEventListener("pointerdown", onDown);
    canvasEl.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      canvasEl.removeEventListener("pointerdown", onDown);
      canvasEl.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [
    gl,
    camera,
    size.width,
    size.height,
    registry,
    controlsRef,
    requireKey,
    overlayRef,
  ]);

  // ✅ nothing DOM is returned inside Canvas
  return null;
}
