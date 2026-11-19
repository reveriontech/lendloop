"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BoardStatus } from "@/components/board-status";
import { Button, buttonVariants } from "@/components/ui/button";
import { AutomationActivity } from "@/components/automation-activity";

export default function MyRequestsPage() {
  const { user } = useUser();
  const requests = useQuery(api.borrowRequests.listByBorrower, user ? { clerkId: user.id } : "skip");
  const cancel = useMutation(api.borrowRequests.cancel);
  const [busy, setBusy] = useState<Id<"borrowRequests"> | null>(null);
  const [error, setError] = useState("");

  async function cancelRequest(requestId: Id<"borrowRequests">) {
    if (!user || busy) return;
    setBusy(requestId);
    setError("");
    try {
      await cancel({ clerkId: user.id, requestId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel this request.");
    } finally {
      setBusy(null);
    }
  }

  const closed = (status: string) => ["returned", "declined", "cancelled"].includes(status);
  const groups = [
    { title: "Active", requests: requests?.filter((request) => !closed(request.status)) },
    { title: "Past", requests: requests?.filter((request) => closed(request.status)) },
  ];

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="board-title">My requests</h1><p className="board-intro">Everything you&apos;ve asked to borrow, and what&apos;s happened since.</p></div>
        <Link className={buttonVariants({ variant: "outline" })} href="/dashboard">Find a tool</Link>
      </header>
      {error && <p className="mb-4 text-sm text-destructive" role="alert">{error}</p>}
      {requests === undefined ? <p role="status">Loading requests…</p> : groups.map((group) => (
        <section className="mb-8" key={group.title}>
          <h2 className="mb-3.5 text-[19px] font-semibold">{group.title}</h2>
          {group.requests?.length === 0 && <p className="rounded-xl border bg-white p-5 text-muted-foreground">No {group.title.toLowerCase()} requests.</p>}
          <div className={group.title === "Past" && group.requests?.length ? "divide-y overflow-hidden rounded-[14px] border bg-white" : "grid gap-3.5"}>
            {group.requests?.map((request) => (
              <article className={group.title === "Past" ? "p-5" : "rounded-[14px] border bg-white p-5"} key={request._id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-lg font-semibold">{request.toolName}</h3><p className="text-sm text-muted-foreground">From {request.lenderName} · {request.startDate} – {request.endDate}</p></div>
                  <BoardStatus status={request.status} />
                </div>
                {request.declineReason && <p className="mt-3 text-sm">{request.declineReason}</p>}
                {request.contactEmail && <a className="mt-3 inline-block text-sm underline" href={"mailto:" + request.contactEmail}>Contact {request.lenderName}</a>}
                {request.status === "pending" && <div className="mt-4"><Button variant="outline" size="sm" disabled={busy !== null} onClick={() => cancelRequest(request._id)}>{busy === request._id ? "Cancelling…" : "Cancel request"}</Button></div>}
                <AutomationActivity requestId={request._id} />
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
