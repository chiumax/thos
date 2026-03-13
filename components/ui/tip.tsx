"use client";

/**
 * Lightweight tooltip for truncated text using CSS positioning.
 *
 * Usage:
 * ```tsx
 * <Tip text={fullText}>
 *   <span className="truncate">{fullText}</span>
 * </Tip>
 * ```
 *
 * Renders nothing special if `text` is falsy — just the children.
 */
export function Tip({
  text,
  side,
  children,
}: {
  text?: string | null;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}) {
  if (!text) return <>{children}</>;

  return (
    <span className="group/tip relative inline min-w-0">
      {children}
      <span
        role="tooltip"
        className={tipPositionClass(side ?? "top")}
      >
        {text}
      </span>
    </span>
  );
}

function tipPositionClass(side: "top" | "bottom" | "left" | "right") {
  const base =
    "pointer-events-none absolute z-50 hidden max-w-xs break-words rounded-md bg-foreground px-3 py-1.5 text-xs text-background group-hover/tip:block";
  switch (side) {
    case "top":
      return `${base} bottom-full left-1/2 mb-2 -translate-x-1/2`;
    case "bottom":
      return `${base} top-full left-1/2 mt-2 -translate-x-1/2`;
    case "left":
      return `${base} right-full top-1/2 mr-2 -translate-y-1/2`;
    case "right":
      return `${base} left-full top-1/2 ml-2 -translate-y-1/2`;
  }
}
