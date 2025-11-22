"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function CreateGroupPage({ params }: { params: { id: string } }) {
  const { id } = useParams();
  const batchId = id;
  const router = useRouter();

  const [batch, setBatch] = useState<any>(null);
  const [form, setForm] = useState({ name: "", size: "" });

  useEffect(() => {
    fetch(`/api/batches/${batchId}`)
      .then((r) => r.json())
      .then(setBatch);
  }, [batchId]);

  const handle = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const submit = async (e: any) => {
    e.preventDefault();

    await fetch(`/api/batches/${batchId}/groups`, {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        size: Number(form.size),
      }),
    });

    router.push(`/batches/${batchId}/groups`);
  };

  if (!batch) return <div className="p-4">Loading...</div>;

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-4">
        Add Group for Batch "{batch.name}"
      </h2>

      <form className="bg-white p-6 border rounded shadow space-y-4" onSubmit={submit}>
        <div>
          <label className="text-sm">Group Name</label>
          <input
            required
            name="name"
            value={form.name}
            onChange={handle}
            className="w-full border p-2 rounded"
            placeholder="A / B / C"
          />
        </div>

        <div>
          <label className="text-sm">Group Size</label>
          <input
            required
            type="number"
            name="size"
            value={form.size}
            onChange={handle}
            className="w-full border p-2 rounded"
            placeholder={`Suggested: ${Math.floor(batch.size / 2)}`}
          />
        </div>

        <button
          type="submit"
          className="w-full bg-indigo-600 text-white py-2 rounded"
        >
          Create
        </button>
      </form>
    </div>
  );
}
