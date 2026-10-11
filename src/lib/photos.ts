import "server-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/db";
import { GameError } from "./game";

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export function uploadsDir() {
  return path.join(dataDir(), "uploads");
}

function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

/** Save an uploaded photo and return its stored file name. */
export async function savePhoto(file: File): Promise<string> {
  if (file.size > MAX_PHOTO_BYTES) throw new GameError("Photos must be 3 MB or smaller.");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniff(buf);
  if (!ext) throw new GameError("Photos must be JPEG, PNG or WebP.");
  fs.mkdirSync(uploadsDir(), { recursive: true });
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir(), name), buf);
  return name;
}

export function deletePhoto(name: string | null) {
  if (!name || !/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return;
  fs.rmSync(path.join(uploadsDir(), name), { force: true });
}
