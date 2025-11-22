"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditGroupPage({
  params,
}: {
  params: { id: string; gid: string };
}) {
  const { id, groupid } = useParams();
  const batchId = id;
  const gid = groupid;
  const router = useRouter();

  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/batches/${batchId}/groups/${gid}`)
      .then((r) => r.json())
      .then(setForm);
  }, [batchId, gid]);

  if (!form) return <div className="p-4">Loading...</div>;

  const handle = (e: any) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e: any) => {
    e.preventDefault();

    await fetch(`/api/batches/${batchId}/groups/${gid}`, {
      method: "PUT",
      body: JSON.stringify({
        name: form.name,
        size: Number(form.size),
      }),
    });

    router.push(`/batches/${batchId}/groups`);
  };

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Edit Group</h2>

      <form className="bg-white border p-6 rounded space-y-4" onSubmit={submit}>
        <div>
          <label className="text-sm">Group Name</label>
          <input
            name="name"
            value={form.name}
            onChange={handle}
            className="border p-2 w-full rounded"
          />
        </div>

        <div>
          <label className="text-sm">Group Size</label>
          <input
            type="number"
            name="size"
            value={form.size}
            onChange={handle}
            className="border p-2 w-full rounded"
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
