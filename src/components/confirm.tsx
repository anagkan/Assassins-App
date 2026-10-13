"use client";

import { useState, type ButtonHTMLAttributes } from "react";

/** A submit button that asks "are you sure?" before the form goes through. */
export function ConfirmButton({ message, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { message: string }) {
  return (
    <button
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}

/**
 * For the most drastic actions: the button stays disabled until the admin types `expected`.
 * The typed value is submitted as `confirmName` so the server can check it too.
 */
export function TypedConfirm({ expected, label, className }: { expected: string; label: string; className?: string }) {
  const [typed, setTyped] = useState("");
  const match = typed.trim() === expected.trim();
  return (
    <div className="space-y-2">
      <label className="block text-xs text-ink-dim">
        Type <b className="select-all text-ink">{expected}</b> to confirm
        <input className="input mt-1" name="confirmName" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      <button className={className} disabled={!match}>{label}</button>
    </div>
  );
}
