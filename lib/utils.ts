import type { CSSProperties } from "react";

export { cn } from "cn";

/**
 * Inline CSS custom properties, typed. React's CSSProperties has no index
 * signature for `--*`, so without this every stagger index needs a cast.
 */
export function vars(values: Record<`--${string}`, string | number>): CSSProperties {
  return values as CSSProperties;
}
