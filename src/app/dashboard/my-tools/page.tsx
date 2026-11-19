"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Availability } from "@/components/board-status";
import { Button, buttonVariants } from "@/components/ui/button";
import { ListingPhoto } from "@/components/listing-photo";
import { ToolIcon } from "@/components/lendloop-brand";
import { formatCategory, formatCondition } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function MyToolsPage() {
  const { user } = useUser();
  const tools = useQuery(api.tools.listByOwner, user ? { clerkId: user.id } : "skip");
  const remove = useMutation(api.tools.remove);
  const [selection, setSelection] = useState<Id<"tools"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteListing() {
    if (!user || !selection || busy) return;
    setBusy(true);
    setError("");
    try {
      await remove({ clerkId: user.id, toolId: selection });
      setSelection(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this listing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="board-title">My listings</h1>
          {tools && <p className="mt-2 text-muted-foreground">{tools.length} {tools.length === 1 ? "tool" : "tools"} listed · {tools.filter((tool) => !tool.isAvailable).length} out on loan</p>}
        </div>
        <Link href="/dashboard/my-tools/new" className={buttonVariants()}><Plus /> List a tool</Link>
      </header>
      {tools === undefined ? <p role="status">Loading listings…</p> : tools.length === 0 ? (
        <p className="rounded-xl border bg-white p-6 text-muted-foreground">You haven&apos;t listed any tools yet.</p>
      ) : (
        <div className="divide-y overflow-hidden rounded-[14px] border bg-white">
          {tools.map((tool) => (
            <article key={tool._id} className="flex flex-wrap items-start gap-4 p-[18px]">
              {tool.photoUrl ? <ListingPhoto src={tool.photoUrl} name={tool.name} thumbnail /> : <ToolIcon category={tool.category} />}
              <div className="min-w-[12rem] flex-1">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-[16.5px] font-semibold">{tool.name}</h2><Availability available={tool.isAvailable} /></div>
                <p className="mt-1 text-sm text-muted-foreground">{formatCategory(tool.category)} · {formatCondition(tool.condition)}</p>
                <p className="mt-2 break-words text-sm">{tool.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!tool.isAvailable && <Link className={buttonVariants({ size: "sm" })} href="/dashboard/incoming">Manage loan</Link>}
                <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={"/dashboard/my-tools/" + tool._id + "/edit"}>Edit</Link>
                <Button variant="destructive" size="sm" disabled={!tool.isAvailable} onClick={() => { setError(""); setSelection(tool._id); }}>Delete</Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog open={selection !== null} onOpenChange={(open) => { if (!open && !busy) setSelection(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this listing?</DialogTitle><DialogDescription>It will be removed from the lending board.</DialogDescription></DialogHeader>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setSelection(null)}>Keep it</Button><Button variant="destructive" disabled={busy} onClick={deleteListing}>{busy ? "Deleting…" : "Delete"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
