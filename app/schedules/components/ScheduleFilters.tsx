"use client";

import { useEffect, useState } from "react";

type FilterProps = {
  onChange: (filters: {
    day: string;
    teacherId: number | null;
    batchId: number | null;
    roomId: number | null;
  }) => void;
};

export default function ScheduleFilters({ onChange }: FilterProps) {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  const [filters, setFilters] = useState({
    day: "ALL",
    teacherId: null as number | null,
    batchId: null as number | null,
    roomId: null as number | null,
  });

  useEffect(() => {
    fetch("/api/teachers").then(res => res.json()).then(setTeachers);
    fetch("/api/batches").then(res => res.json()).then(setBatches);
    fetch("/api/rooms").then(res => res.json()).then(setRooms);
  }, []);

  const updateFilter = (key: string, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onChange(newFilters);
  };

  console.log({updateFilter})

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Day Filter */}
          <select
              className="p-2 border rounded"
              onChange={(e) => updateFilter("day", e.target.value)}
          >
              <option value="ALL">All Days</option>
              <option value="SUN">Sunday</option>
              <option value="MON">Monday</option>
              <option value="TUE">Tuesday</option>
              <option value="WED">Wednesday</option>
              <option value="THU">Thursday</option>
          </select>


      {/* Teacher Filter */}
      <select
        className="p-2 border rounded"
        onChange={(e) =>
          updateFilter("teacherId", e.target.value === "ALL" ? null : Number(e.target.value))
        }
      >
        <option value="ALL">All Teachers</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {/* Batch Filter */}
      <select
        className="p-2 border rounded"
        onChange={(e) =>
          updateFilter("batchId", e.target.value === "ALL" ? null : Number(e.target.value))
        }
      >
        <option value="ALL">All Batches</option>
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      {/* Room Filter */}
      <select
        className="p-2 border rounded"
        onChange={(e) =>
          updateFilter("roomId", e.target.value === "ALL" ? null : Number(e.target.value))
        }
      >
        <option value="ALL">All Rooms</option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.roomNumber}
          </option>
        ))}
      </select>
    </div>
  );
}
