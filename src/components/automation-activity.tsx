"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { formatDistanceToNow } from "date-fns";

export function AutomationActivity({
  requestId,
}: {
  requestId: Id<"borrowRequests">;
}) {
  const logs = useQuery(api.borrowRequests.getAutomationLogs, { requestId });

  if (!logs || logs.length === 0) return null;

  return (
    <div className="mt-3 border-t pt-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        Automation Activity
      </p>
      <ul className="space-y-1">
        {logs.slice(-3).map((log) => (
          <li key={log._id} className="text-xs text-muted-foreground">
            {log.message}{" "}
            <span className="opacity-60">
              {formatDistanceToNow(log.createdAt, { addSuffix: true })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
