"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to sign in");
      router.push("/"); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign in"); setBusy(false); }
  }
  return <main className="login-shell"><section className="login-card"><div className="login-brand"><div className="brand-mark">OA</div><div><p className="eyebrow">Octave</p><h1>Outreach Agent</h1></div></div><div className="login-copy"><h2>Welcome back.</h2><p>Sign in to your protected campaign workspace.</p></div>{error && <div className="alert error" role="alert">{error}</div>}<form onSubmit={signIn} className="login-form"><label>Username<input name="username" autoComplete="username" required minLength={3} autoFocus /></label><label>Password<input name="password" type="password" autoComplete="current-password" required minLength={12} /></label><button className="primary-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<span>→</span></button></form><p className="login-note">Your administrator controls workspace access. Sessions expire automatically.</p></section></main>;
}
