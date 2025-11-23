export default function ScheduleForm({ submitText }: { submitText: string }) {
    return (
        <form className="grid grid-cols-2 gap-4 max-w-2xl">
            <select className="p-2 border rounded"><option>Day</option></select>
            <input type="time" className="p-2 border rounded" />
            <input type="time" className="p-2 border rounded" />
            <select className="p-2 border rounded"><option>Teacher</option></select>
            <select className="p-2 border rounded"><option>Course</option></select>
            <select className="p-2 border rounded"><option>Batch</option></select>
            <select className="p-2 border rounded"><option>Group</option></select>
            <select className="p-2 border rounded"><option>Room</option></select>


            <button className="col-span-2 mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">
                {submitText}
            </button>
        </form>
    );
}