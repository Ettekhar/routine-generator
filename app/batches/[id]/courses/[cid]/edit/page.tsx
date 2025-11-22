"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditBatchCourse({ params }: { params: { id: string; cid: string } }) {
  const { id, cid } = useParams();
  const batchId = id;
  //  cid = params.cid;
  const router = useRouter();

  const [courses, setCourses] = useState<any[]>([]);
  const [form, setForm] = useState({
    courseId: "",
    requiresLab: false,
    groupCount: "",
  });

  useEffect(() => {
    // fetch all courses
    fetch("/api/courses")
      .then((r) => r.json())
      .then(setCourses);

    // fetch batch course
    fetch(`/api/batches/${batchId}/courses/${cid}`)
      .then((r) => r.json())
      .then((data) =>
        setForm({
          courseId: data.courseId,
          requiresLab: data.requiresLab,
          groupCount: data.groupCount ?? "",
        })
      );
  }, [batchId, cid]);

  const handle = (e: any) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const submit = async (e: any) => {
    e.preventDefault();

    await fetch(`/api/batches/${batchId}/courses/${cid}`, {
      method: "PUT",
      body: JSON.stringify({
        courseId: Number(form.courseId),
        requiresLab: form.requiresLab,
        groupCount: form.groupCount ? Number(form.groupCount) : null,
      }),
    });

    router.push(`/batches/${batchId}/courses`);
  };
  console.log({courses});
  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-xl font-bold mb-4">Edit Course Assignment</h2>

      <form className="bg-white border p-6 rounded space-y-4" onSubmit={submit}>
        {/* Course */}
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
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}--{c.title}
              </option>
            ))}
          </select>
        </div>

        {/* Requires Lab */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            name="requiresLab"
            checked={form.requiresLab}
            onChange={handle}
          />
          <label>Requires Lab?</label>
        </div>

        {/* Group Count */}
        {form.requiresLab && (
          <div>
            <label className="text-sm">Group Count</label>
            <input
              type="number"
              name="groupCount"
              value={form.groupCount}
              onChange={handle}
              className="border p-2 w-full rounded"
              min={1}
              required
            />
          </div>
        )}

        <button className="w-full bg-indigo-600 text-white py-2 rounded">
          Save Changes
        </button>
      </form>
    </div>
  );
}
