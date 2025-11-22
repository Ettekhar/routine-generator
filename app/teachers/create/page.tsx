// app/teachers/create/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateTeacher() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    shortName: "",
    designation: "",
    department: "",
    contact: "",
    weeklyLoad: "",
    dailyLoad: "",
  });

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      shortName: form.shortName,
      designation: form.designation,
      department: form.department,
      contact: form.contact || null,
      weeklyLoad: form.weeklyLoad ? Number(form.weeklyLoad) : null,
      dailyLoad: form.dailyLoad ? Number(form.dailyLoad) : null,
    };
    const res = await fetch("/api/teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) router.push("/teachers");
    else alert("Error");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Create Teacher</h2>
      <form onSubmit={submit} className="bg-white border rounded p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input name="name" value={form.name} onChange={handle} required className="mt-1 block w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium">Short Name</label>
          <input name="shortName" value={form.shortName} onChange={handle} required className="mt-1 block w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium">Designation</label>
          <input name="designation" value={form.designation} onChange={handle} required className="mt-1 block w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium">Department</label>
          <input name="department" value={form.department} onChange={handle} required className="mt-1 block w-full border p-2 rounded" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Contact</label>
            <input name="contact" value={form.contact} onChange={handle} className="mt-1 block w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Weekly Load (hrs)</label>
            <input name="weeklyLoad" value={form.weeklyLoad} onChange={handle} type="number" className="mt-1 block w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Daily Load (hrs)</label>
            <input name="dailyLoad" value={form.dailyLoad} onChange={handle} type="number" className="mt-1 block w-full border p-2 rounded" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Create</button>
          <button type="button" onClick={() => history.back()} className="px-4 py-2 border rounded">Cancel</button>
        </div>
      </form>
    </div>
  );
}
