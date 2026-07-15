import { STATUS_LABELS, STATUS_STYLES, Status } from "@/lib/status";

export function StatusBadge({ status }: { status: string }) {
  const s = (status in STATUS_LABELS ? status : "reached_out") as Status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[s]}`}
    >
      {STATUS_LABELS[s]}
    </span>
  );
}
