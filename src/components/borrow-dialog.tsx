"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export function BorrowDialog({
  toolId,
  toolName,
  owner,
  condition,
  dueDate,
  onSent,
  open,
  onClose,
}: {
  toolId: Id<"tools">;
  toolName: string;
  owner: string;
  condition: string;
  dueDate: string | null;
  onSent: () => void;
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useUser();
  const createRequest = useMutation(api.borrowRequests.create);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const dueTime = dueDate ? Date.parse(dueDate) : NaN;
  const nextDate = Number.isFinite(dueTime) ? new Date(dueTime + 86_400_000).toISOString().slice(0, 10) : null;
  const minDate = nextDate && nextDate > today ? nextDate : today;
  const invalidDates = !startDate || !endDate || startDate < minDate || endDate < startDate;

  async function handleSubmit() {
    if (!user || invalidDates || loading) return;
    setLoading(true);
    setError("");
    try {
      // The mutation also queues the lender's n8n notification (convex/automation.ts).
      await createRequest({
        clerkId: user.id,
        toolId,
        startDate,
        endDate,
        note: note.trim() || undefined,
      });
      onSent();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create request");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open && !loading) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[18px] bg-white p-5 sm:max-w-[520px] sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-[22px] leading-tight">Request {toolName}</DialogTitle>
          <DialogDescription>From {owner} &middot; {condition} condition</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {dueDate && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">On loan until {dueDate}. Choose later dates. The lender can approve once the current loan closes.</p>}
          <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor="borrow-start" className="mb-1 block text-sm font-medium">From</label>
            <Input
              id="borrow-start"
              className="h-11"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={minDate}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="borrow-end" className="mb-1 block text-sm font-medium">To</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || minDate}
            />
          </div>
          </div>
          <label className="grid gap-2 text-sm font-medium">Note for {owner.split(" ")[0]} (optional)
            <Textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
          </label>
          <p className="text-[13px] text-muted-foreground">{owner.split(" ")[0]} gets a notification with the tool name and your dates. Contact details are shared only if they approve.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="m-0 rounded-none bg-white px-0 pt-4 pb-0">
          <Button variant="outline" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || invalidDates}
          >
            {loading ? "Submitting..." : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
