"use client";

import { useState, useEffect, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";

type Course = {
  id: number;
  title: string;
  code: string;
  type: "THEORY" | "LAB";
  credit: number;
};

export default function EditCoursePage() {
  const { id } = useParams();
  const courseId = Number(id);
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch course data
  useEffect(() => {
    fetch(`/api/courses/${courseId}`)
      .then((res) => res.json())
      .then((data) => {
        setCourse(data);
        setLoading(false);
      });
  }, [courseId]);

  // Handle form submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!course) return;

    setSaving(true);
    const res = await fetch(`/api/courses/${courseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(course),
    });

    setSaving(false);
    if (res.ok) {
      alert("Course updated successfully!");
      router.push("/courses");
    } else {
      alert("Failed to update course.");
    }
  };

  if (loading) return <p>Loading course...</p>;
  if (!course) return <p>Course not found</p>;

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Edit Course</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Course Name */}
        <div>
          <label className="block mb-1 font-medium">Course Name</label>
          <input
            type="text"
            value={course.title}
            onChange={(e) => setCourse({ ...course, title: e.target.value })}
            className="w-full border px-3 py-2 rounded"
            required
          />
        </div>

        {/* Course Code */}
        <div>
          <label className="block mb-1 font-medium">Course Code</label>
          <input
            type="text"
            value={course.code}
            onChange={(e) => setCourse({ ...course, code: e.target.value })}
            className="w-full border px-3 py-2 rounded"
            required
          />
        </div>

        {/* Course Type */}
        <div>
          <label className="block mb-1 font-medium">Course Type</label>
          <select
            value={course.type}
            onChange={(e) =>
              setCourse({ ...course, type: e.target.value as "THEORY" | "LAB" })
            }
            className="w-full border px-3 py-2 rounded"
            required
          >
            <option value="THEORY">Theory</option>
            <option value="LAB">Lab</option>
          </select>
        </div>

        {/* Credit */}
        <div>
          <label className="block mb-1 font-medium">Credit</label>
          <input
            type="number"
            value={course.credit}
            onChange={(e) =>
              setCourse({ ...course, credit: Number(e.target.value) })
            }
            className="w-full border px-3 py-2 rounded"
            required
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          {saving ? "Saving..." : "Update Course"}
        </button>
      </form>
    </div>
  );
}
