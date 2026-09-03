"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

export function PageViewTracker() {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    track("page_view");
  }, []);

  return null;
}
