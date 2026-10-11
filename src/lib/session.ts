import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import type { User } from "@/db/schema";
import { bootstrapAdmin, createSession, deleteSession, userForToken } from "./auth";

const COOKIE = "assassins_session";

let bootstrapped: Promise<void> | null = null;
export function ensureBootstrapped() {
  bootstrapped ??= bootstrapAdmin(getDb());
  return bootstrapped;
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  await ensureBootstrapped();
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? userForToken(getDb(), token) : null;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}

export async function startSession(userId: number) {
  const { token, expiresAt } = createSession(getDb(), userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) deleteSession(getDb(), token);
  jar.delete(COOKIE);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "unknown";
}
