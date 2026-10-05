"use client";

import dynamic from "next/dynamic";

// The reader lives on localStorage (settings, text, position), so render it
// in the browser only and skip a hydration mismatch.
export const ClientReader = dynamic(() => import("./Reader").then((m) => m.Reader), { ssr: false });
