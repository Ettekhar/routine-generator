"use client";

import { useState } from "react";
import ScheduleTable from "./components/ScheduleTable";
import ScheduleFilters from "./components/ScheduleFilters";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function SchedulesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    day: "ALL",
    teacherId: null as number | null,
    batchId: null as number | null,
    roomId: null as number | null,
  });

  // Hold the filtered rows from the table
  const [filteredRows, setFilteredRows] = useState<any[]>([]);

  const generateRoutine = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/schedules/generate", { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate routine");
      await res.json();
      router.refresh();
      router.push(`/schedules`);
    } catch (err) {
      console.error(err);
      alert("Error generating routine");
    } finally {
      setLoading(false);
    }
  };

  // Generate PDF from current filteredRows
  const downloadPDF = () => {
    if (filteredRows.length === 0) return alert("No data to download");

    const doc = new jsPDF();

    // Map data into array of arrays for autoTable
    const tableData = filteredRows.map((row) => [
      row.day,
      `${row.startTime} - ${row.endTime}`,
      row.teacher.name,
      row.course.title,
      row.batch.name,
      row.room.roomNumber,
    ]);

    autoTable(doc, {
      head: [["Day", "Time", "Teacher", "Course", "Batch", "Room"]],
      body: tableData,
    });

    doc.save("schedules.pdf");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Schedules</h1>

        <div className="flex gap-2">
          <a
            href="/schedules/create"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Add
          </a>

          <button
            onClick={generateRoutine}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            {loading ? "Generating..." : "Generate Routine"}
          </button>

          <button
            onClick={downloadPDF}
            className="px-4 py-2 bg-green-600 text-white rounded-lg"
          >
            Download PDF
          </button>
        </div>
      </div>

      <ScheduleFilters onChange={(f) => setFilters(f)} />
          <ScheduleTable
              filters={filters}
              setFilteredRowsParent={setFilteredRows} // name must match child prop
          />

    </div>
  );
}
