import ScheduleForm from "../components/ScheduleForm";


export default function CreateSchedulePage() {
return (
<div className="p-6 space-y-6">
<h1 className="text-2xl font-semibold">Create Schedule</h1>
<ScheduleForm submitText="Create" />
</div>
);
}