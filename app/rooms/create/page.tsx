"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateRoom() {
  const router = useRouter();
  const [form, setForm] = useState({
    roomNumber: "",
    capacity: 0,
    type: "CLASSROOM",
  });

  const handle = (e: any) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e: any) => {
    e.preventDefault();
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        capacity: Number(form.capacity),
      }),
    });

    if (res.ok) router.push("/rooms");
    else alert("Error creating room");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Create Room</h2>

      <form onSubmit={submit} className="bg-white p-6 shadow border rounded space-y-4">
        <div>
          <label className="block text-sm font-medium">Room Number</label>
          <input name="roomNumber" value={form.roomNumber}
                 onChange={handle}
                 required className="border p-2 rounded w-full mt-1" />
        </div>

        <div>
          <label className="block text-sm font-medium">Capacity</label>
          <input type="number" name="capacity" value={form.capacity}
                 onChange={handle}
                 required className="border p-2 rounded w-full mt-1" />
        </div>

        <div>
          <label className="block text-sm font-medium">Type</label>
          <select name="type" value={form.type}
                  onChange={handle}
                  className="border p-2 rounded w-full mt-1">
            <option value="CLASSROOM">CLASSROOM</option>
            <option value="LAB">LAB</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Create</button>
          <button type="button" onClick={() => history.back()} className="px-4 py-2 border rounded">Cancel</button>
        </div>
      </form>
    </div>
  );
}
