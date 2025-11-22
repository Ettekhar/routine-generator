// app/courses/create/page.tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateCourse() {
  const router = useRouter();
  const [form, setForm] = useState({
    code: "",
    title: "",
    credit: 0,
    semester: 1,
    type: "THEORY",
  });

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...form, credit: Number(form.credit), semester: Number(form.semester) };
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) router.push("/courses");
    else {
      const data = await res.json();
      alert(data?.message || "Error");
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Create Course</h2>
      <form onSubmit={submit} className="bg-white border rounded p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium">Code</label>
          <input name="code" value={form.code} onChange={handle} required className="mt-1 block w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium">Title</label>
          <input name="title" value={form.title} onChange={handle} required className="mt-1 block w-full border p-2 rounded" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium">Credit</label>
            <input name="credit" value={String(form.credit)} onChange={handle} type="number" step="0.5" className="mt-1 block w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Semester</label>
            <input name="semester" value={String(form.semester)} onChange={handle} type="number" min={1} className="mt-1 block w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Type</label>
            <select name="type" value={form.type} onChange={handle} className="mt-1 block w-full border p-2 rounded">
              <option value="THEORY">THEORY</option>
              <option value="LAB">LAB</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Create</button>
          <button type="button" onClick={() => history.back()} className="px-4 py-2 border rounded">Cancel</button>
        </div>
      </form>
    </div>
  );
}
