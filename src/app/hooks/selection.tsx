import React, { createContext, useContext, useMemo, useRef } from "react";
import * as THREE from "three";

type PointsEntry = {
  id: string;
  points: THREE.Points;
  // setter that accepts either a value or an updater fn
  setSelected: React.Dispatch<React.SetStateAction<number[]>>;
};

type SelectionRegistry = {
  register: (entry: PointsEntry) => () => void;
  entries: () => PointsEntry[];
};

const SelectionContext = createContext<SelectionRegistry | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const mapRef = useRef(new Map<string, PointsEntry>());

  const api = useMemo<SelectionRegistry>(() => {
    return {
      register: (entry) => {
        mapRef.current.set(entry.id, entry);
        return () => mapRef.current.delete(entry.id);
      },
      entries: () => Array.from(mapRef.current.values()),
    };
  }, []);

  return (
    <SelectionContext.Provider value={api}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelectionRegistry() {
  const ctx = useContext(SelectionContext);
  if (!ctx)
    throw new Error(
      "useSelectionRegistry must be used inside <SelectionProvider />",
    );
  return ctx;
}
