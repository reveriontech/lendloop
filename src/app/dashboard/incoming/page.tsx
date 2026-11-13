"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatStatus, statusColor } from "@/lib/format";
import { AutomationActivity } from "@/components/automation-activity";
import { Check, X, PackageCheck, Undo2 } from "lucide-react";

export default function IncomingRequestsPage() {
  const { user } = useUser();
  const requests = useQuery(
    api.borrowRequests.listByLender,
    user ? { clerkId: user.id } : "skip"
  );
  const approve = useMutation(api.borrowRequests.approve);
  const decline = useMutation(api.borrowRequests.decline);
  const markBorrowed = useMutation(api.borrowRequests.markBorrowed);
  const markReturned = useMutation(api.borrowRequests.markReturned);

  async function sendWebhook(event: string, requestId: string) {
    fetch("/api/n8n/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, requestId }),
    }).catch(() => {});
  }

  async function handleApprove(requestId: string) {
    if (!user) return;
    await approve({ clerkId: user.id, requestId: requestId as Id<"borrowRequests"> });
    sendWebhook("borrow_request_approved", requestId);
  }

  async function handleDecline(requestId: string) {
    if (!user) return;
    await decline({ clerkId: user.id, requestId: requestId as Id<"borrowRequests"> });
    sendWebhook("borrow_request_declined", requestId);
  }

  async function handleMarkBorrowed(requestId: string) {
    if (!user) return;
    await markBorrowed({ clerkId: user.id, requestId: requestId as Id<"borrowRequests"> });
    sendWebhook("loan_started", requestId);
  }

  async function handleMarkReturned(requestId: string) {
    if (!user) return;
    await markReturned({ clerkId: user.id, requestId: requestId as Id<"borrowRequests"> });
    sendWebhook("loan_returned", requestId);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Incoming Requests</h1>

      {requests === undefined ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-5 w-1/2 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No incoming borrow requests.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <Card key={req._id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{req.toolName}</CardTitle>
                  <Badge variant={statusColor(req.status)}>
                    {formatStatus(req.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 text-sm text-muted-foreground">
                  <p>Borrower: {req.borrowerName}</p>
                  <p>
                    {req.startDate} → {req.endDate}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {req.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => handleApprove(req._id)}>
                        <Check className="mr-1 size-3" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDecline(req._id)}
                      >
                        <X className="mr-1 size-3" /> Decline
                      </Button>
                    </>
                  )}
                  {req.status === "approved" && (
                    <Button size="sm" onClick={() => handleMarkBorrowed(req._id)}>
                      <PackageCheck className="mr-1 size-3" /> Mark Borrowed
                    </Button>
                  )}
                  {(req.status === "borrowed" || req.status === "overdue") && (
                    <Button size="sm" onClick={() => handleMarkReturned(req._id)}>
                      <Undo2 className="mr-1 size-3" /> Mark Returned
                    </Button>
                  )}
                </div>
                <AutomationActivity requestId={req._id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
