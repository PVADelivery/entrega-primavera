import { type ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function DriverShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-md">{children}</div>
      <BottomNav />
    </div>
  );
}