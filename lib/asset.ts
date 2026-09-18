import { statSync } from "node:fs";
import { join } from "node:path";

/**
 * Real byte size of a file in public/, read at build time.
 *
 * The résumé card states its own file size (SPEC-v2 §11). A stated size that
 * drifts from the actual file is a small lie in the one place this system
 * claims to be authoritative, so it is measured rather than written down.
 */
export function publicFileSize(fileName: string): string {
  const bytes = statSync(join(process.cwd(), "public", fileName)).size;
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
