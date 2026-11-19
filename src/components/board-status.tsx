import { formatStatus } from "@/lib/format";

const tones: Record<string, string> = {
  available: "bg-[#e6f4ec] text-[#166a43]",
  approved: "bg-[#e6f4ec] text-[#166a43]",
  pending: "bg-[#e9effe] text-[#1d4ed8]",
  borrowed: "bg-[#fdf1e3] text-[#92400e]",
  overdue: "bg-[#fdecea] text-[#b42318]",
};

export function BoardStatus({ status, label }: { status: string; label?: string }) {
  return (
    <span className={"inline-flex h-[26px] w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] leading-none font-semibold before:size-1.5 before:rounded-full before:bg-current " + (tones[status] ?? "bg-[#edeef0] text-[#4b5260]")}>
      {label ?? formatStatus(status)}
    </span>
  );
}

export function Availability({ available }: { available: boolean }) {
  return <BoardStatus status={available ? "available" : "borrowed"} label={available ? "Available" : "On loan"} />;
}
