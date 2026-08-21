"use client";

import { useEffect, useState } from "react";

type InternalSectionNavItem = {
  id: string;
  label: string;
};

type InternalSectionNavProps = {
  items: InternalSectionNavItem[];
};

export function InternalSectionNav({
  items,
}: InternalSectionNavProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => first.boundingClientRect.top - second.boundingClientRect.top);

        if (visibleEntries.length > 0) {
          setActiveId(visibleEntries[0].target.id);
        }
      },
      {
        root: null,
        rootMargin: "-18% 0px -70% 0px",
        threshold: 0,
      },
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [items]);

  const navigateToSection = (id: string): void => {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <nav
      aria-label="Page sections"
      className="sticky top-3 z-20 overflow-x-auto rounded-xl border border-[#DCE4EE] bg-white/95 px-2 py-2 shadow-[0_1px_3px_rgba(25,50,76,0.08)] backdrop-blur"
    >
      <div className="flex min-w-max items-center gap-1">
        {items.map((item) => {
          const active = activeId === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateToSection(item.id)}
              aria-current={active ? "location" : undefined}
              className={[
                "rounded-lg px-3 py-2 text-[12px] font-semibold transition",
                active
                  ? "bg-[#E8F0FB] text-[#315F9D]"
                  : "text-[#68737D] hover:bg-[#F5F7F9] hover:text-[#303840]",
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
