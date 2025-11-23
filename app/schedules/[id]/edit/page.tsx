import ScheduleForm from "../../components/ScheduleForm";


export default function EditSchedulePage() {
    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-semibold">Edit Schedule</h1>
            <ScheduleForm submitText="Update" />
        </div>
    );
}