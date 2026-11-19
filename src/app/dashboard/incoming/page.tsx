"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { BoardStatus } from "@/components/board-status";
import { Button } from "@/components/ui/button";
import { AutomationActivity } from "@/components/automation-activity";

export default function IncomingRequestsPage() {
  const { user } = useUser();
  const requests = useQuery(api.borrowRequests.listByLender, user ? { clerkId: user.id } : "skip");
  const approve = useMutation(api.borrowRequests.approve);
  const decline = useMutation(api.borrowRequests.decline);
  const markBorrowed = useMutation(api.borrowRequests.markBorrowed);
  const markReturned = useMutation(api.borrowRequests.markReturned);
  const [busy, setBusy] = useState<Id<"borrowRequests"> | null>(null);
  const [error, setError] = useState("");

  // Each mutation also queues the borrower's n8n notification (convex/automation.ts).
  const actions = {
    pending: [
      { run: decline, label: "Decline", variant: "outline" },
      { run: approve, label: "Approve", variant: "default" },
    ],
    approved: [{ run: markBorrowed, label: "Mark borrowed", variant: "default" }],
    borrowed: [{ run: markReturned, label: "Mark returned", variant: "default" }],
    overdue: [{ run: markReturned, label: "Mark returned", variant: "default" }],
  } as const;

  async function apply(requestId: Id<"borrowRequests">, action: (typeof actions)[keyof typeof actions][number]) {
    if (!user || busy) return;
    setBusy(requestId);
    setError("");
    try {
      await action.run({ clerkId: user.id, requestId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the request.");
    } finally {
      setBusy(null);
    }
  }

  const pending = requests?.filter((request) => request.status === "pending");
  const groups = [
    { title: "Waiting for you", requests: pending },
    { title: "Earlier", requests: requests?.filter((request) => request.status !== "pending") },
  ];

  return (
    <>
      <h1 className="board-title">Incoming requests</h1>
      <p className="board-intro">Approve or decline requests for your tools. Borrowers are notified either way.</p>
      {error && <p className="mb-4 text-sm text-destructive" role="alert">{error}</p>}
      {requests === undefined ? <p role="status">Loading requests…</p> : groups.map((group) => (
        <section className="mb-8" key={group.title}>
          <h2 className="mb-3.5 flex items-center gap-2 text-[19px] font-semibold">{group.title}{group.requests === pending && <Badge variant="secondary">{pending?.length}</Badge>}</h2>
          {group.requests?.length === 0 && <p className="rounded-xl border bg-white p-5 text-muted-foreground">{group.requests === pending ? "You’re all caught up. New requests will show up here." : "No earlier requests."}</p>}
          <div className={group.requests !== pending && group.requests?.length ? "divide-y overflow-hidden rounded-[14px] border bg-white" : "grid gap-3.5"}>
            {group.requests?.map((request) => (
              <article className={group.requests === pending ? "rounded-[14px] border bg-white p-5" : "p-5"} key={request._id}>
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">{request.borrowerName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                    <div>
                      <h3 className="text-lg font-semibold">{request.borrowerName} {request.status === "pending" ? "wants to borrow your " : "· "}{request.toolName}</h3>
                      <p className="text-sm text-muted-foreground">{request.startDate} – {request.endDate}</p>
                    </div>
                  </div>
                  <BoardStatus status={request.status} />
                </header>
                {request.note && <blockquote className="mt-3 break-words rounded-lg bg-background p-3 text-sm text-muted-foreground">“{request.note}”</blockquote>}
                {request.contactEmail && <a className="mt-3 inline-block text-sm underline" href={"mailto:" + request.contactEmail}>Contact {request.borrowerName}</a>}
                {request.status in actions && (
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {actions[request.status as keyof typeof actions].map((action) => (
                      <Button key={action.label} size="sm" variant={action.variant} disabled={busy !== null} onClick={() => apply(request._id, action)}>{action.label}</Button>
                    ))}
                  </div>
                )}
                <AutomationActivity requestId={request._id} />
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
