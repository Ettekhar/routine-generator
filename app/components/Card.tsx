// components/Card.tsx
import { ReactNode } from "react";

export default function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border rounded p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
