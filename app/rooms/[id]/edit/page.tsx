"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function EditRoom({ params }: { params: { id: string } }) {
  const id = params.id;
  const router = useRouter();
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/rooms/${id}`).then(r => r.json()).then(setForm);
  }, [id]);

  if (!form) return <div>Loading...</div>;

  const handle = (e: any) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e: any) => {
    e.preventDefault();
    const res = await fetch(`/api/rooms/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        capacity: Number(form.capacity),
      }),
    });

    if (res.ok) router.push("/rooms");
    else alert("Failed to update");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Edit Room</h2>

      <form onSubmit={submit} className="bg-white border rounded p-6 space-y-4">

        <div>
          <label className="block text-sm font-medium">Room Number</label>
          <input name="roomNumber" value={form.roomNumber}
                 onChange={handle} className="border p-2 rounded w-full mt-1" />
        </div>

        <div>
          <label className="block text-sm font-medium">Capacity</label>
          <input name="capacity" type="number" value={form.capacity}
                 onChange={handle} className="border p-2 rounded w-full mt-1" />
        </div>

        <div>
          <label className="block text-sm font-medium">Type</label>
          <select name="type" value={form.type} onChange={handle} className="border p-2 rounded w-full mt-1">
            <option value="CLASSROOM">CLASSROOM</option>
            <option value="LAB">LAB</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button className="px-4 py-2 bg-indigo-600 text-white rounded">Update</button>
          <button type="button" onClick={() => router.back()} className="px-4 py-2 border rounded">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
