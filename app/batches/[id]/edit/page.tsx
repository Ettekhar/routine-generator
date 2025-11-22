"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditBatchPage({ params }: { params: { id: string } }) {
  const { id } = useParams();
  const router = useRouter();

  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/batches/${id}`)
      .then((r) => r.json())
      .then(setForm);
  }, [id]);

  if (!form) return <div className="p-4">Loading...</div>;

  const handle = (e: any) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e: any) => {
    e.preventDefault();

    const res = await fetch(`/api/batches/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: form.name,
        size: Number(form.size),
      }),
    });

    if (res.ok) router.push("/batches");
    else alert("Error updating batch");
  };

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Edit Batch</h2>

      <form className="bg-white p-6 border rounded space-y-4" onSubmit={submit}>
        <div>
          <label className="block text-sm font-medium">Batch Name</label>
          <input
            name="name"
            value={form.name}
            onChange={handle}
            className="border p-2 rounded w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Batch Size</label>
          <input
            name="size"
            type="number"
            value={form.size}
            onChange={handle}
            className="border p-2 rounded w-full"
          />
        </div>

        <div className="flex gap-2">
          <button className="px-4 py-2 bg-indigo-600 text-white rounded">
            Update
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border rounded"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
