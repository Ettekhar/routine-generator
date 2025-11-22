"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Group = {
  id: number;
  name: string;
  size: number;
};

export default function BatchGroupsPage({ params }: { params: { id: string } }) {
  const { id } = useParams(); // ✅ get id from URL
  const batchId = id;
  const [groups, setGroups] = useState<Group[]>([]);
  const [batch, setBatch] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/batches/${batchId}`)
      .then((r) => r.json())
      .then(setBatch);

    fetch(`/api/batches/${batchId}/groups`)
      .then((r) => r.json())
      .then(setGroups);
  }, [batchId]);

  const del = async (gid: number) => {
    if (!confirm("Delete this group?")) return;

    await fetch(`/api/batches/${batchId}/groups/${gid}`, {
      method: "DELETE",
    });

    setGroups((prev) => prev.filter((g) => g.id !== gid));
  };

  if (!batch) return <div className="p-4">Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between mb-6 items-center">
        <h2 className="text-2xl font-bold">
          Groups of Batch: <span className="text-indigo-600">{batch.name}</span>
        </h2>

        <Link
          href={`/batches/${batchId}/groups/create`}
          className="px-4 py-2 bg-indigo-600 text-white rounded"
        >
          Create Group
        </Link>
      </div>

      <div className="bg-white border rounded shadow">
        <table className="w-full">
          <thead className="bg-neutral-100">
            <tr>
              <th className="p-3 text-left">Group Name</th>
              <th className="p-3 text-left">Size</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {groups.map((g) => (
              <tr className="border-t" key={g.id}>
                <td className="p-3">{g.name}</td>
                <td className="p-3">{g.size}</td>

                <td className="p-3 text-center">
                  <Link
                    href={`/batches/${batchId}/groups/${g.id}/edit`}
                    className="text-indigo-600 mr-4"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => del(g.id)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {groups.length === 0 && (
              <tr>
                <td className="p-4 text-center text-gray-600" colSpan={3}>
                  No groups found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
