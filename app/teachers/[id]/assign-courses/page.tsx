"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Course = { id: number; title: string };
type Teacher = { id: number; name: string };

export default function AssignCourses({ params }: { params: { id: string } }) {
  const {id} = useParams();
  const router = useRouter();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<number[]>([]);
  useEffect(() => {
    fetch(`/api/teachers/${id}`).then(r => r.json()).then(setTeacher);
    fetch(`/api/courses`).then(r => r.json()).then(setCourses);
    fetch(`/api/course-assignments?teacherId=${id}`)
      .then(r => r.json())
      .then((data: any) => setSelectedCourses(data.map((c: any) => c.courseId)));
  }, [id]);

  const toggleCourse = (id: number) => {
    setSelectedCourses(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const save = async () => {
    await fetch(`/api/course-assignments/${id}`, {
      method: "PUT",
      body: JSON.stringify({ courseIds: selectedCourses }),
      headers: { "Content-Type": "application/json" },
    });
    router.back();
  };

  if (!teacher) return <div>Loading...</div>;
    console.log({courses,selectedCourses});

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Assign Courses to {teacher.name}</h2>
      {courses.map(c => (
        <div key={c.id}>
          <label>
            <input
              type="checkbox"
              checked={selectedCourses.includes(c.id)}
              onChange={() => toggleCourse(c.id)}
            />{" "}
            {c.title}
          </label>
        </div>
      ))}
      <button
        onClick={save}
        className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded"
      >
        Save
      </button>
    </div>
  );
}
