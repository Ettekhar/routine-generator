// app/teachers/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Teacher = {
  id: number;
  name: string;
  shortName: string;
  designation: string;
  department: string;
  contact?: string | null;
  weeklyLoad?: number | null;
  dailyLoad?: number | null;
};

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/teachers")
      .then((r) => r.json())
      .then((data) => setTeachers(data))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this teacher?")) return;
    await fetch(`/api/teachers/${id}`, { method: "DELETE" });
    setTeachers((t) => t.filter((x) => x.id !== id));
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Teachers</h2>
        <Link
          href="/teachers/create"
          className="btn-primary px-4 py-2 bg-indigo-600 text-white rounded"
        >
          Add Teacher
        </Link>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="bg-white border rounded shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-100">
              <tr>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Short</th>
                <th className="p-3 text-left">Designation</th>
                <th className="p-3 text-left">Dept</th>
                <th className="p-3 text-left">Weekly/Daily</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-3">{t.name}</td>
                  <td className="p-3">{t.shortName}</td>
                  <td className="p-3">{t.designation}</td>
                  <td className="p-3">{t.department}</td>
                  <td className="p-3">
                    {t.weeklyLoad ?? "-"} / {t.dailyLoad ?? "-"}
                  </td>
                  <td className="p-3 text-center flex justify-center gap-2">
                    <Link
                      href={`/teachers/${t.id}/edit`}
                      className="text-indigo-600"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-red-600"
                    >
                      Delete
                    </button>
                    <Link
                      href={`/teachers/${t.id}/assign-courses`}
                      className="text-green-600"
                    >
                      Assign Courses
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}