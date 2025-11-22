"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateBatchPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    size: "",
  });

  const handle = (e: any) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e: any) => {
    e.preventDefault();

    const res = await fetch("/api/batches", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        size: Number(form.size),
      }),
    });

    if (res.ok) router.push("/batches");
    else alert("Error creating batch");
  };

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Create Batch</h2>

      <form onSubmit={submit} className="bg-white shadow p-6 rounded border space-y-4">
        <div>
          <label className="text-sm font-medium">Batch Name</label>
          <input
            name="name"
            required
            className="border p-2 rounded w-full"
            value={form.name}
            onChange={handle}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Batch Size</label>
          <input
            name="size"
            type="number"
            required
            className="border p-2 rounded w-full"
            value={form.size}
            onChange={handle}
          />
        </div>

        <button className="px-4 py-2 bg-indigo-600 text-white rounded w-full">
          Create
        </button>
      </form>
    </div>
  );
}
