// app/page.tsx
import Card from "./components/Card";
import Link from "next/link";

export default async function Dashboard() {
  // Could fetch counts from APIs here; for now show quick links
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-neutral-500">Teachers</div>
          <div className="text-2xl font-bold">--</div>
          <Link href="/teachers" className="text-sm text-indigo-600 mt-2 inline-block">Manage teachers</Link>
        </Card>
        <Card>
          <div className="text-sm text-neutral-500">Courses</div>
          <div className="text-2xl font-bold">--</div>
          <Link href="/courses" className="text-sm text-indigo-600 mt-2 inline-block">Manage courses</Link>
        </Card>
        <Card>
          <div className="text-sm text-neutral-500">Schedules</div>
          <div className="text-2xl font-bold">--</div>
          <Link href="/schedules" className="text-sm text-indigo-600 mt-2 inline-block">View schedule</Link>
        </Card>
      </div>
    </div>
  );
}
