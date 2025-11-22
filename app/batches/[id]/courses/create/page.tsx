"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function CreateBatchCourse({ params }: { params: { id: string } }) {
  const { id } = useParams();
    
  const batchId = id;
  const router = useRouter();

  const [levels, setLevels] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);

  const [form, setForm] = useState({
    levelId: "",
    categoryId: "",
    courseId: "",
    expiresAt: "",
    requiresLab: false,
    groupCount: "",
  });

  useEffect(() => {
    fetch("/api/levels").then((r) => r.json()).then(setLevels);
    fetch("/api/categories").then((r) => r.json()).then(setCategories);
    fetch("/api/courses").then((r) => r.json()).then(setCourses);
  }, []);

  const handle = (e: any) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const submit = async (e: any) => {
    e.preventDefault();

    await fetch(`/api/batches/${batchId}/courses`, {
      method: "POST",
      body: JSON.stringify({
        ...form,
        levelId: Number(form.levelId),
        categoryId: Number(form.categoryId),
        courseId: Number(form.courseId),
        groupCount: form.groupCount || null,
      }),
    });

    router.push(`/batches/${batchId}/courses`);
  };

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-xl font-bold mb-4">Assign Course to Batch</h2>

      <form className="bg-white border p-6 rounded space-y-4" onSubmit={submit}>
        {/* level */}
        <div>
          <label className="text-sm">Level</label>
          <select
            name="levelId"
            value={form.levelId}
            onChange={handle}
            className="w-full border p-2 rounded"
            required
          >
            <option value="">Select Level</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* category */}
        <div>
          <label className="text-sm">Category</label>
          <select
            name="categoryId"
            value={form.categoryId}
            onChange={handle}
            className="w-full border p-2 rounded"
            required
          >
            <option value="">Select Category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* course */}
        <div>
          <label className="text-sm">Course</label>
          <select
            name="courseId"
            value={form.courseId}
            onChange={handle}
            className="w-full border p-2 rounded"
            required
          >
            <option value="">Select Course</option>
            {courses
              .filter((x) => x.categoryId == form.categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>

        {/* expiresAt */}
        <div>
          <label className="text-sm">Expires At</label>
          <input
            type="date"
            name="expiresAt"
            value={form.expiresAt}
            onChange={handle}
            className="w-full border p-2 rounded"
          />
        </div>

        {/* requires lab */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            name="requiresLab"
            checked={form.requiresLab}
            onChange={handle}
          />
          <label>Requires Lab?</label>
        </div>

        {/* groupCount */}
        {form.requiresLab && (
          <div>
            <label className="text-sm">Group Count</label>
            <input
              type="number"
              name="groupCount"
              value={form.groupCount}
              onChange={handle}
              required={form.requiresLab}
              className="border p-2 w-full rounded"
              min={1}
            />
          </div>
        )}

        <button className="w-full bg-indigo-600 text-white py-2 rounded">
          Assign Course
        </button>
      </form>
    </div>
  );
}
