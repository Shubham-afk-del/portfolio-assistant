import { existsSync, readFileSync } from "node:fs";
import { LABELS, LABEL_SET, load, save } from "@/evals/store";

export const runtime = "nodejs";

/**
 * Saves one hand label for judge validation (Phase 3 step 4). Development
 * only: the labels are the owner's, written to evals/labels.json on his own
 * machine, and a production build answers 404.
 */
export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });

  const body = (await request.json()) as { id?: unknown; faithful?: unknown; note?: unknown };
  if (typeof body.id !== "string" || typeof body.faithful !== "boolean") {
    return new Response("id and faithful are required", { status: 400 });
  }
  const set = existsSync(LABEL_SET)
    ? (JSON.parse(readFileSync(LABEL_SET, "utf8")) as { items: { id: string }[] })
    : { items: [] };
  if (!set.items.some((item) => item.id === body.id)) return new Response("Unknown item", { status: 404 });

  const note = typeof body.note === "string" && body.note.trim() !== "" ? body.note.trim().slice(0, 500) : undefined;
  const labels = load<object>(LABELS);
  labels[body.id] = { faithful: body.faithful, ...(note === undefined ? {} : { note }), at: new Date().toISOString() };
  save(LABELS, labels);
  return Response.json({ labelled: Object.keys(labels).length });
}
