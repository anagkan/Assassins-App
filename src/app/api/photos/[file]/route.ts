import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/session";
import { uploadsDir } from "@/lib/photos";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { file } = await params;
  const m = /^[a-f0-9]{32}\.(jpg|png|webp)$/.exec(file);
  if (!m) return new Response("Not found", { status: 404 });
  const full = path.join(uploadsDir(), file);
  if (!fs.existsSync(full)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(full), {
    headers: { "Content-Type": TYPES[m[1]], "Cache-Control": "private, max-age=86400, immutable" },
  });
}
