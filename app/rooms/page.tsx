"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Room = {
  id: number;
  roomNumber: string;
  capacity: number;
  type: "CLASSROOM" | "LAB";
};

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    fetch("/api/rooms").then(r => r.json()).then(setRooms);
  }, []);

  const del = async (id: number) => {
    if (!confirm("Delete this room?")) return;
    await fetch(`/api/rooms/${id}`, { method: "DELETE" });
    setRooms(r => r.filter(x => x.id !== id));
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Rooms</h2>
        <Link href="/rooms/create" className="px-4 py-2 bg-indigo-600 text-white rounded">
          Add Room
        </Link>
      </div>

      <div className="bg-white border rounded shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-neutral-100">
            <tr>
              <th className="p-3 text-left">Room Number</th>
              <th className="p-3 text-left">Capacity</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.roomNumber}</td>
                <td className="p-3">{r.capacity}</td>
                <td className="p-3">{r.type}</td>
                <td className="p-3">
                  <Link href={`/rooms/${r.id}/edit`} className="text-indigo-600 mr-3">
                    Edit
                  </Link>
                  <button onClick={() => del(r.id)} className="text-red-600">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
