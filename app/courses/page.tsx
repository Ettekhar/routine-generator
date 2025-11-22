// app/courses/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Course = {
  id: number;
  code: string;
  title: string;
  credit: number;
  semester: number;
  type: "THEORY" | "LAB";
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    fetch("/api/courses").then(r => r.json()).then(setCourses);
  }, []);

  const del = async (id: number) => {
    if (!confirm("Delete course?")) return;
    await fetch(`/api/courses/${id}`, { method: "DELETE" });
    setCourses(cs => cs.filter(c => c.id !== id));
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">Courses</h2>
        <Link href="/courses/create" className="px-4 py-2 bg-indigo-600 text-white rounded">Add Course</Link>
      </div>

      <div className="bg-white border rounded shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-neutral-100">
            <tr>
              <th className="p-3 text-left">Code</th>
              <th className="p-3 text-left">Title</th>
              <th className="p-3 text-left">Credit</th>
              <th className="p-3 text-left">Semester</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {courses.map(c => (
              <tr key={c.id} className="border-t">
                <td className="p-3">{c.code}</td>
                <td className="p-3">{c.title}</td>
                <td className="p-3">{c.credit}</td>
                <td className="p-3">{c.semester}</td>
                <td className="p-3">{c.type}</td>
                <td className="p-3">
                  <Link href={`/courses/${c.id}/edit`} className="mr-2 text-indigo-600">Edit</Link>
                  <button onClick={() => del(c.id)} className="text-red-600">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
