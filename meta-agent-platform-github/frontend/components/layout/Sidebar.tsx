"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../ui/Icon";

type NavigationItem = {
  label: string;
  icon: IconName;
  href: string;
};

const mainNavigation: NavigationItem[] = [
  { label: "My Agent Teams", icon: "bot", href: "/app" },
  { label: "Agent Team Builder", icon: "builder", href: "/app/builder" },
  { label: "Run Agent Teams", icon: "chat", href: "/app/chat" },
];

type SidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
};

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Sidebar panel */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-20 w-[270px] border-r border-[#c2d1e4] bg-[#D7E4F4] px-3 py-5 text-[#4b4d52]",
          "hidden lg:flex lg:flex-col",
          "transition-transform duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="mb-7 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Icon name="logo" className="size-8" />
            <span className="text-[18px] font-semibold tracking-[-0.01em] text-[#3b3d42]">AIR-Agent</span>
            <Icon name="chevronDown" className="size-3.5 text-[#86888d]" />
          </div>
          <button
            onClick={onToggle}
            className="rounded-md p-1.5 text-[#60636a] transition hover:bg-black/5"
            aria-label="Hide sidebar"
          >
            <Icon name="layout" className="size-5" />
          </button>
        </div>

        <nav className="space-y-1">
          {mainNavigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={[
                  "flex h-[34px] w-full items-center gap-3 rounded-md px-3 text-[16px] font-medium transition",
                  isActive
                    ? "bg-[#e8f0fb] text-[#19324c] shadow-[inset_3px_0_0_#3569b8,0_1px_2px_rgba(25,50,76,0.08)]"
                    : "text-[#50535a] hover:bg-black/5 hover:text-[#2f3034]",
                ].join(" ")}
              >
                <Icon
                  name={item.icon}
                  className={["size-5 shrink-0", isActive ? "text-[#3569b8]" : "text-[#62656b]"].join(" ")}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Re-open button when sidebar is hidden */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed left-3 top-5 z-30 hidden rounded-md bg-[#D7E4F4] p-1.5 text-[#60636a] shadow-md transition hover:bg-[#c2d1e4] lg:flex"
          aria-label="Show sidebar"
        >
          <Icon name="layout" className="size-5" />
        </button>
      )}
    </>
  );
}
