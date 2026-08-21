"use client";

import { createContext, useContext } from "react";

export const SidebarContext = createContext(true);

export function useSidebarOpen() {
  return useContext(SidebarContext);
}
