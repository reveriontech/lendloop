"use client";

import { useState, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { format } from "date-fns";
import { api } from "../../convex/_generated/api";
import { BoardStatus, Availability } from "@/components/board-status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCategory, formatStatus } from "@/lib/format";

type Row = { id: string; cells: ReactNode[] };

function AdminTable({ columns, rows, empty }: { columns: string[]; rows?: Row[]; empty: string }) {
  if (!rows) return <p role="status" className="text-muted-foreground">Loading&hellip;</p>;
  if (!rows.length) return <p className="rounded-[14px] border bg-white p-5 text-muted-foreground">{empty}</p>;

  return (
    <div className="overflow-hidden rounded-[14px] border bg-white">
      <table className="admin-table w-full text-sm">
        <thead>
          <tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(({ id, cells }) => (
            <tr key={id}>{cells.map((cell, index) => <td data-label={columns[index]} key={columns[index]}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const tabs = [
  { value: "tools", label: "Listings" },
  { value: "loans", label: "Loans" },
  { value: "users", label: "Lenders" },
  { value: "automation", label: "Automation" },
];

const loanFilters = ["all", "pending", "approved", "borrowed", "overdue", "returned", "declined", "cancelled"];

/** "request.created" → "Request created" */
function formatEvent(type: string) {
  const words = type.replace(/[._]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

export default function AdminContent() {
  const { user } = useUser();
  const me = useQuery(api.auth.getMe, user ? { clerkId: user.id } : "skip");
  const adminArgs = user && me?.role === "admin" ? { clerkId: user.id } : "skip";
  const users = useQuery(api.admin.listUsers, adminArgs);
  const allLoans = useQuery(api.admin.listAllLoans, adminArgs);
  const allTools = useQuery(api.tools.list, adminArgs === "skip" ? "skip" : {});
  const activity = useQuery(api.admin.listAutomationActivity, adminArgs);
  const health = useQuery(api.admin.automationHealth, adminArgs);
  const retryEvent = useMutation(api.admin.retryAutomationEvent);
  const setTrustedLender = useMutation(api.admin.setTrustedLender);
  const adminRemoveTool = useMutation(api.tools.adminRemove);
  const [tab, setTab] = useState("tools");
  const [loanFilter, setLoanFilter] = useState("all");
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your change.");
    }
  }

  if (!me || !user) return <p role="status">Loading admin&hellip;</p>;
  if (me.role !== "admin") return <p className="rounded-[14px] border bg-white p-8 text-center text-destructive">You do not have admin access.</p>;

  const metrics = [
    { label: "Listings", value: allTools?.length },
    { label: "Active loans", value: allLoans?.filter((loan) => ["approved", "borrowed", "overdue"].includes(loan.status)).length },
    { label: "Trusted lenders", value: users?.filter((member) => member.isTrustedLender).length },
    { label: "Automation issues", value: health && health.undelivered.length + health.workflowFailures.length },
  ];
  const listedByLender = new Map<string, number>();
  const returnedByLender = new Map<string, number>();
  const latestByLoan = new Map<string, string>();
  allTools?.forEach((tool) => listedByLender.set(tool.ownerId, (listedByLender.get(tool.ownerId) ?? 0) + 1));
  allLoans?.forEach((loan) => {
    if (loan.status === "returned") returnedByLender.set(loan.lenderId, (returnedByLender.get(loan.lenderId) ?? 0) + 1);
  });
  activity?.forEach((event) => {
    if (!latestByLoan.has(event.borrowRequestId)) latestByLoan.set(event.borrowRequestId, event.message);
  });

  return (
    <div>
      <h1 className="board-title">Admin</h1>
      <p className="board-intro">Moderate listings, review loans and keep an eye on automations.</p>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map(({ label, value }, index) => (
          <button type="button" className="rounded-[14px] border bg-white px-[18px] py-4 text-left hover:border-input" key={label} onClick={() => setTab(tabs[index].value)}>
            <span className="block font-heading text-[26px] leading-none font-semibold">{value ?? "\u2013"}</span>
            <span className="mt-1.5 block text-sm text-muted-foreground">{label}</span>
          </button>
        ))}
      </div>
      {error && <p className="mb-4 text-sm text-destructive" role="alert">{error}</p>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" aria-label="Admin sections" className="h-[46px] w-full justify-start overflow-x-auto border-b p-0 [scrollbar-width:none] group-data-horizontal/tabs:h-[46px]">
          {tabs.map(({ value, label }) => <TabsTrigger key={value} className="flex-none px-3.5 text-[14.5px] group-data-horizontal/tabs:after:bottom-0" value={value}>{label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="tools" className="mt-4">
          <p className="mb-4 text-muted-foreground">Remove listings that break the house rules. Tools out on loan can be removed once the loan closes.</p>
          <AdminTable columns={["Tool", "Owner", "Category", "Status", "Listed", "Action"]} empty="No listings yet." rows={allTools?.map((tool) => ({
            id: tool._id,
            cells: [
              <strong key="tool">{tool.name}</strong>,
              <span key="owner">{tool.ownerName}{tool.isTrustedLender && <span className="ml-2 text-xs font-semibold text-[#166a43]">Trusted</span>}</span>,
              formatCategory(tool.category),
              <Availability key="status" available={tool.isAvailable} />,
              format(tool.createdAt, "MMM d, yyyy"),
              <Button key="action" size="sm" variant="destructive" disabled={!tool.isAvailable} onClick={() => run(() => adminRemoveTool({ clerkId: user.id, toolId: tool._id }))}>Remove</Button>,
            ],
          }))} />
        </TabsContent>

        <TabsContent value="loans" className="mt-4">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter loans" role="group">
            {loanFilters.map((status) => <button type="button" key={status} aria-pressed={loanFilter === status} onClick={() => setLoanFilter(status)} className="min-h-[38px] shrink-0 rounded-full border border-input bg-white px-3.5 font-medium aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-white">{status === "all" ? "All loans" : formatStatus(status)}</button>)}
          </div>
          <AdminTable columns={["Tool", "Borrower / lender", "Dates", "Status", "Last automation"]} empty="No matching loan records." rows={allLoans?.filter((loan) => loanFilter === "all" || loan.status === loanFilter).map((loan) => ({
            id: loan._id,
            cells: [
              <strong key="tool">{loan.toolName}</strong>,
              <span key="parties">{loan.borrowerName} &rarr; {loan.lenderName}</span>,
              <span key="dates">{loan.startDate} &ndash; {loan.endDate}</span>,
              <BoardStatus key="status" status={loan.status} />,
              latestByLoan.get(loan._id) ?? "\u2013",
            ],
          }))} />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <p className="mb-4 text-muted-foreground">Trusted lenders get a badge on their listings. Only admins can grant or remove it.</p>
          <AdminTable columns={["Lender", "Listings", "Loans completed", "Joined", "Badge", "Action"]} empty="No lenders yet." rows={users?.map((member) => ({
            id: member._id,
            cells: [
              <span key="member"><strong>{member.name}</strong><span className="block break-all text-xs text-muted-foreground">{member.email}</span></span>,
              listedByLender.get(member._id) ?? 0,
              returnedByLender.get(member._id) ?? 0,
              format(member.createdAt, "MMM d, yyyy"),
              member.isTrustedLender ? <BoardStatus key="badge" status="available" label="Trusted lender" /> : "None",
              <Button key="action" size="sm" variant="outline" onClick={() => run(() => setTrustedLender({ clerkId: user.id, userId: member._id, trusted: !member.isTrustedLender }))}>{member.isTrustedLender ? "Remove badge" : "Mark trusted"}</Button>,
            ],
          }))} />
        </TabsContent>

        <TabsContent value="automation" className="mt-4">
          <h2 className="mb-1 font-heading text-lg font-semibold">Undelivered events</h2>
          <p className="mb-4 text-muted-foreground">Events Convex couldn&apos;t hand to n8n after 5 attempts, or skipped because n8n isn&apos;t configured.</p>
          <AdminTable columns={["Event", "Tool", "Problem", "Attempts", "When", "Action"]} empty="Every event reached n8n." rows={health?.undelivered.map((event) => ({
            id: event._id,
            cells: [
              <strong key="event">{formatEvent(event.type)}</strong>,
              event.toolName,
              <span key="problem" className="text-destructive">{event.lastError ?? (event.status === "skipped" ? "Skipped" : "Failed")}</span>,
              event.attempts,
              format(event.updatedAt, "MMM d, yyyy p"),
              <Button key="action" size="sm" variant="outline" onClick={() => run(() => retryEvent({ clerkId: user.id, eventId: event._id }))}>Retry</Button>,
            ],
          }))} />

          <h2 className="mt-8 mb-1 font-heading text-lg font-semibold">Failed n8n runs</h2>
          <p className="mb-4 text-muted-foreground">Reported by the n8n error workflow after a workflow&apos;s retries ran out.</p>
          <AdminTable columns={["Workflow", "Node", "Error", "When"]} empty="No failed runs reported." rows={health?.workflowFailures.map((failure) => ({
            id: failure._id,
            cells: [
              <strong key="workflow">{failure.workflowName}</strong>,
              failure.nodeName ?? "–",
              failure.executionUrl && isWebUrl(failure.executionUrl)
                ? <a key="error" href={failure.executionUrl} target="_blank" rel="noreferrer" className="underline">{failure.message}</a>
                : failure.message,
              format(failure.createdAt, "MMM d, yyyy p"),
            ],
          }))} />

          <h2 className="mt-8 mb-1 font-heading text-lg font-semibold">Recent activity</h2>
          <p className="mb-4 text-muted-foreground">Notifications and reminders n8n reported back.</p>
          <AdminTable columns={["Event", "Status", "Message", "When"]} empty="No automation activity yet." rows={activity?.map((event) => ({
            id: event._id,
            cells: [
              <strong key="event">{formatEvent(event.type)}</strong>,
              <span key="status" className={event.status === "failed" ? "text-destructive" : undefined}>{event.status === "failed" ? "Failed" : "Sent"}</span>,
              event.message,
              format(event.updatedAt, "MMM d, yyyy p"),
            ],
          }))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
