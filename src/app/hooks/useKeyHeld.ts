"use client";

import { useEffect, useState } from "react";

export function useKeyHeld(key: string) {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === key.toLowerCase()) setHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === key.toLowerCase()) setHeld(false);
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", () => setHeld(false)); // safety

    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", () => setHeld(false));
    };
  }, [key]);

  return held;
}
