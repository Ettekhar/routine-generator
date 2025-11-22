"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Batch = {
  id: number;
  name: string;
  size: number;
  groups: { id: number; name: string }[];
};

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    fetch("/api/batches")
      .then((r) => r.json())
      .then(setBatches);
  }, []);

  const del = async (id: number) => {
    if (!confirm("Delete this Batch?")) return;

    await fetch(`/api/batches/${id}`, { method: "DELETE" });

    setBatches((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Batches</h2>
        <Link
          href="/batches/create"
          className="px-4 py-2 bg-indigo-600 text-white rounded"
        >
          Add Batch
        </Link>
      </div>

      <div className="bg-white border rounded shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-neutral-100">
            <tr>
              <th className="p-3 text-left">Batch Name</th>
              <th className="p-3 text-left">Size</th>
              <th className="p-3 text-left">Groups</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-3">{b.name}</td>
                <td className="p-3">{b.size}</td>
                <td className="p-3">{b.groups.map((g) => g.name).join(", ")}</td>

                <td className="p-3 text-center">
                  <Link
                    href={`/batches/${b.id}/edit`}
                    className="text-indigo-600 mr-4"
                  >
                    Edit
                  </Link>

                  <button
                    onClick={() => del(b.id)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>

                  <Link
                    href={`/batches/${b.id}/groups`}
                    className="ml-4 text-green-600"
                  >
                    Groups →
                  </Link>
                  
                  <Link
                    href={`/batches/${b.id}/courses/assign`}
                    className="ml-4 text-purple-600 hover:underline"
                  >
                    Assign Courses →
                  </Link>

                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
