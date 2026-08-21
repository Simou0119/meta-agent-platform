"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginPage } from "../components/login/LoginPage";
import { getApiBaseUrl } from "../lib/api";

type AuthStatus = "checking" | "anonymous";

export default function Home() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch(`${getApiBaseUrl()}/api/me`, { credentials: "include" })
      .then((r) => {
        if (!active) return;
        if (r.ok) router.replace("/app");
        else setAuthStatus("anonymous");
      })
      .catch(() => {
        if (active) setAuthStatus("anonymous");
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogin(credentials: { username: string; password: string }) {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(credentials),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return { ok: false as const, error: data?.detail ?? "Login failed." };
      }
      router.push("/app");
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: "Unable to connect to the server." };
    }
  }

  if (authStatus === "checking") {
    return <main className="min-h-screen bg-[#EDF2F8]" />;
  }

  return <LoginPage onLogin={handleLogin} />;
}
