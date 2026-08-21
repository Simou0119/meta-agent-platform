"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../../components/layout/Sidebar";
import { FloatingTools } from "../../components/layout/FloatingTools";
import { SidebarContext } from "../../components/layout/SidebarContext";
import { getApiBaseUrl } from "../../lib/api";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/me`, { credentials: "include" })
      .then((r) => {
        if (r.ok) setReady(true);
        else router.replace("/");
      })
      .catch(() => router.replace("/"));
  }, [router]);

  if (!ready) {
    return <div className="min-h-screen bg-[#F0F5FA]" />;
  }

  return (
    <SidebarContext.Provider value={sidebarOpen}>
      <main
        className="min-h-screen bg-[#F0F5FA] text-[#1f2026] transition-[padding] duration-300"
        style={{ paddingLeft: sidebarOpen ? 270 : 0 }}
      >
        <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />
        <div className="mx-auto w-full max-w-[1362px] px-5 py-6 sm:px-8 lg:px-10 lg:py-[62px]">
          {children}
        </div>
        <FloatingTools />
      </main>
    </SidebarContext.Provider>
  );
}
