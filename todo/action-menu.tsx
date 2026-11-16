import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function ActionMenu({children}: {children: ReactNode}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return <details ref={ref} className="relative" onClick={event => {
    if ((event.target as Element).closest("button") && ref.current) ref.current.open = false;
  }}>{children}</details>;
}
