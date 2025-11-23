"use client";

import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type ScheduleRow = {
  id: number;
  day: string;
  startTime: string;
  endTime: string;

  teacher: { id: number; name: string };
  course: { id: number; title: string };
  group: { id: number; name: string };
  batch: { id: number; name: string };
  room: { id: number; roomNumber: string };
};

type Filters = {
  groupId: any;
  day: string;
  teacherId: number | null;
  batchId: number | null;
  roomId: number | null;
};

export default function ScheduleTable({
  filters,
  setFilteredRowsParent, // optional prop to expose filtered rows to parent
}: {
  filters: Filters;
  setFilteredRowsParent?: (rows: ScheduleRow[]) => void;
}) {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<ScheduleRow[]>([]);

  // Load all schedules initially
  useEffect(() => {
    fetch("/api/schedules")
      .then((res) => res.json())
      .then((data: ScheduleRow[]) => {
        setRows(data);
        setFilteredRows(data);
        setFilteredRowsParent?.(data); // initial
      })
      .catch((err) => console.error("Error loading schedules:", err));
  }, [setFilteredRowsParent]);

  // Apply filters whenever they change
  useEffect(() => {
    let temp = [...rows];

    if (filters.day !== "ALL") temp = temp.filter((r) => r.day === filters.day);
    if (filters.teacherId) temp = temp.filter((r) => r.teacher.id === filters.teacherId);
    if (filters.groupId) temp = temp.filter((r) => r.group.id === filters.groupId);
    if (filters.batchId) temp = temp.filter((r) => r.batch.id === filters.batchId);
    if (filters.roomId) temp = temp.filter((r) => r.room.id === filters.roomId);

    setFilteredRows(temp);
    setFilteredRowsParent?.(temp); // update parent with current filtered rows
  }, [filters, rows, setFilteredRowsParent]);

  // Delete schedule
    const deleteSchedule = async (id: number) => {
        await fetch(`/api/schedules/${id}`, { method: "DELETE" });

        const newRows = rows.filter((r) => r.id !== id);
        const newFilteredRows = filteredRows.filter((r) => r.id !== id);

        setRows(newRows);
        setFilteredRows(newFilteredRows);
        setFilteredRowsParent?.(newFilteredRows);
    };


  // Download filtered table as PDF
  const downloadPDF = () => {
    if (filteredRows.length === 0) return alert("No data to download");

    const doc = new jsPDF();

    // Optional: dynamic header showing filters
    const filterText = `Schedules${
      filters.day !== "ALL" ? ` - ${filters.day}` : ""
    }`;
    doc.setFontSize(14);
    doc.text(filterText, 14, 15);

    const tableData = filteredRows.map((row) => [
      row.day,
      `${row.startTime} – ${row.endTime}`,
      row.teacher.name,
      row.course.title,
      row.batch.name,
      row.room.roomNumber,
    ]);

    autoTable(doc, {
      startY: 20,
      head: [["Day", "Time", "Teacher", "Course", "Batch", "Room"]],
      body: tableData,
    });

    doc.save("schedules.pdf");
  };
  console.log(filteredRows[1])
  return (
    <div className="space-y-2">
        {/* 
        <button
        onClick={downloadPDF}
        className="px-4 py-2 bg-green-600 text-white rounded-lg"
        >
        Download PDF
        </button>
        */}


      <table className="w-full border mt-2">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Day</th>
            <th className="p-2 border">Time</th>
            <th className="p-2 border">Teacher</th>
            <th className="p-2 border">Course</th>
            <th className="p-2 border">Group</th>
            <th className="p-2 border">Batch</th>
            <th className="p-2 border">Room</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>

        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center p-4 text-gray-500">
                No schedules found
              </td>
            </tr>
          ) : (
            filteredRows.map((s) => (
              <tr key={s.id}>
                <td className="p-2 border">{s.day}</td>
                <td className="p-2 border">
                  {s.startTime} – {s.endTime}
                </td>
                <td className="p-2 border">{s.teacher.name}</td>
                <td className="p-2 border">{s.course.title}</td>
                <td className="p-2 border">{s.group ? s.group.name : "All"}</td>
                <td className="p-2 border">{s.batch.name}</td>
                <td className="p-2 border">{s.room.roomNumber}</td>
                <td className="p-2 border space-x-2">
                  <button
                    className="text-red-600"
                    onClick={() => deleteSchedule(s.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
