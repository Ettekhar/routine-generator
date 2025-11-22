// components/Sidebar.tsx
import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r">
      <div className="p-4 text-xl font-bold">Admin</div>
      <nav className="p-4 space-y-1">
        <Link href="/" className="block p-2 rounded hover:bg-neutral-100">Dashboard</Link>
        <Link href="/teachers" className="block p-2 rounded hover:bg-neutral-100">Teachers</Link>
        <Link href="/courses" className="block p-2 rounded hover:bg-neutral-100">Courses</Link>
        <Link href="/batches" className="block p-2 rounded hover:bg-neutral-100">Batches</Link>
        <Link href="/rooms" className="block p-2 rounded hover:bg-neutral-100">Rooms</Link>
        <Link href="/schedules" className="block p-2 rounded hover:bg-neutral-100">Schedules</Link>
      </nav>
    </aside>
  );
}
