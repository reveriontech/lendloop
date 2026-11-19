"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CATEGORIES } from "../../../convex/schema";
import { Input } from "@/components/ui/input";
import { Availability } from "@/components/board-status";
import { Button, buttonVariants } from "@/components/ui/button";
import { ListingPhoto } from "@/components/listing-photo";
import { ToolIcon } from "@/components/lendloop-brand";
import { formatCategory, formatCondition } from "@/lib/format";
import { BorrowDialog } from "@/components/borrow-dialog";

export default function BrowseToolsPage() {
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [selection, setSelection] = useState<{ id: Id<"tools">; name: string; owner: string; condition: string; dueDate: string | null } | null>(null);
  const [notice, setNotice] = useState("");
  const results = useQuery(api.tools.list, { search: search.trim() || undefined, category: category || undefined });
  const requests = useQuery(api.borrowRequests.listByBorrower, user ? { clerkId: user.id } : "skip");
  const tools = results?.filter((tool) => !availableOnly || tool.isAvailable);
  const activeToolIds = new Set(requests?.filter((request) => ["pending", "approved", "borrowed", "overdue"].includes(request.status)).map((request) => request.toolId));

  return (
    <>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="board-title">Browse tools</h1><p className="mt-2 text-muted-foreground">Borrow from neighbors in your loop.</p></div>
          <div className="relative w-full sm:max-w-[340px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label="Search tools" placeholder="Search tools" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 bg-white pl-10" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="-mx-5 flex min-w-0 basis-[calc(100%+2.5rem)] gap-2 overflow-x-auto sm:flex-1 px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label="Filter by category" role="group">
            {["", ...CATEGORIES].map((item) => (
              <button key={item} type="button" aria-pressed={item === category} onClick={() => setCategory(item)} className="min-h-[38px] shrink-0 whitespace-nowrap rounded-full border border-input bg-white px-3.5 text-sm font-medium hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-white">
                {item ? formatCategory(item) : "All tools"}
              </button>
            ))}
          </div>
          <label className="inline-flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /> Available only</label>
        </div>
      </div>
      {notice && <p className="mt-5 rounded-lg bg-secondary p-3 text-sm text-secondary-foreground" role="status">{notice}</p>}
      {tools === undefined ? <p className="mt-7 text-muted-foreground" role="status">Loading tools…</p> : (
        <>
          <p className="my-6 text-sm text-muted-foreground">{tools.length} {tools.length === 1 ? "tool" : "tools"}</p>
          {tools.length === 0 ? (
            <div className="rounded-xl border bg-white p-8 text-center">
              <h2 className="text-xl font-semibold">{search || category || availableOnly ? "No tools match" : "No tools listed yet"}</h2>
              {(search || category || availableOnly) && <Button className="mt-4" variant="outline" onClick={() => { setSearch(""); setCategory(""); setAvailableOnly(false); }}>Clear filters</Button>}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool) => (
                <article className="flex min-w-0 flex-col gap-3.5 rounded-[14px] border bg-white p-[18px]" key={tool._id}>
                  {tool.photoUrl && <ListingPhoto src={tool.photoUrl} name={tool.name} />}
                  <div className="flex items-center justify-between gap-2"><ToolIcon category={tool.category} /><Availability available={tool.isAvailable} /></div>
                  <div><h2 className="break-words text-lg leading-tight font-semibold">{tool.name}</h2><p className="text-sm text-muted-foreground">{formatCategory(tool.category)} · {formatCondition(tool.condition)}</p></div>
                  <p className="grow break-words text-sm">{tool.description}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground" aria-hidden="true">{tool.ownerName.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</span>Lent by {tool.ownerName}</span>
                    {tool.isTrustedLender && <span className="inline-flex items-center gap-1 text-secondary-foreground"><ShieldCheck className="size-4" /> Trusted lender</span>}
                  </div>
                  {tool.isOwn ? <Link href="/dashboard/my-tools" className={buttonVariants({ variant: "outline" })}>Manage your listing</Link>
                    : activeToolIds.has(tool._id) ? <Link href="/dashboard/my-requests" className={buttonVariants({ variant: "outline" })}>View your request</Link>
                    : (tool.isAvailable || tool.dueDate) && <Button variant="outline" onClick={() => { setNotice(""); setSelection({ id: tool._id, name: tool.name, owner: tool.ownerName, condition: formatCondition(tool.condition), dueDate: tool.dueDate }); }}>{tool.isAvailable ? "Request to borrow" : "Request later dates"}</Button>}
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {selection && <BorrowDialog toolId={selection.id} toolName={selection.name} owner={selection.owner} condition={selection.condition} dueDate={selection.dueDate} open onClose={() => setSelection(null)} onSent={() => setNotice("Request sent. " + selection.owner + " will be notified.")} />}
    </>
  );
}
