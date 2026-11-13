"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatStatus, statusColor } from "@/lib/format";
import { AutomationActivity } from "@/components/automation-activity";

export default function MyRequestsPage() {
  const { user } = useUser();
  const requests = useQuery(
    api.borrowRequests.listByBorrower,
    user ? { clerkId: user.id } : "skip"
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My Requests</h1>

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
            You haven&apos;t requested to borrow any tools yet.
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
                <div className="text-sm text-muted-foreground">
                  <p>Lender: {req.lenderName}</p>
                  <p>
                    {req.startDate} → {req.endDate}
                  </p>
                  {req.declineReason && (
                    <p className="mt-1 text-destructive">
                      Reason: {req.declineReason}
                    </p>
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
