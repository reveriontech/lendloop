"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { LISTING_PHOTO_MAX_BYTES, LISTING_PHOTO_TYPES } from "../../convex/listingPhoto";
import { CATEGORIES, CONDITIONS } from "../../convex/schema";
import { formatCategory, formatCondition } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Availability } from "@/components/board-status";
import { ListingPhoto } from "@/components/listing-photo";
import { ToolIcon } from "@/components/lendloop-brand";

const conditionDetails = { like_new: "Barely used", good: "Works well with light wear", fair: "Works with visible wear", well_used: "Heavily used but functional" };

const back = "/dashboard/my-tools";

export function ListingEditor({ toolId }: { toolId?: string }) {
  const { user } = useUser();
  const tools = useQuery(api.tools.listByOwner, toolId && user ? { clerkId: user.id } : "skip");
  if (!toolId) return <ListingForm />;
  if (tools === undefined) return <p role="status">Loading listing…</p>;
  const tool = tools.find((item) => item._id === toolId);
  return tool ? <ListingForm key={tool._id} tool={tool} /> : <p>Listing not found. <Link className="underline" href={back}>My listings</Link></p>;
}

function ListingForm({ tool }: { tool?: Doc<"tools"> & { photoUrl: string | null } }) {
  const { user } = useUser();
  const router = useRouter();
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const [form, setForm] = useState({
    name: tool?.name ?? "", category: tool?.category ?? "power_tools",
    condition: tool?.condition ?? "good", description: tool?.description ?? "",
  });
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>();
  const [photoError, setPhotoError] = useState("");
  const previewUrl = photo === undefined ? tool?.photoUrl : photo?.url;
  const selectedUrl = photo?.url;
  useEffect(() => () => {
    if (selectedUrl) URL.revokeObjectURL(selectedUrl);
  }, [selectedUrl]);

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!file.size || file.size > LISTING_PHOTO_MAX_BYTES) {
      setPhotoError("Choose a photo that is 2 MB or smaller.");
      return;
    }
    if (file.type && !LISTING_PHOTO_TYPES.some((type) => type === file.type)) {
      setPhotoError("Choose a JPEG, PNG, or WebP photo.");
      return;
    }
    setPhotoError("");
    setPhoto({ file, url: URL.createObjectURL(file) });
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !form.name.trim() || !form.description.trim() || saving) return;
    setSaving(true);
    setError("");
    const args = { ...form, clerkId: user.id, name: form.name.trim(), description: form.description.trim() };
    try {
      const bytes = photo ? await photo.file.arrayBuffer() : undefined;
      if (tool) await update({ ...args, toolId: tool._id, photo: photo === null ? null : bytes });
      else await create({ ...args, photo: bytes });
      router.push(back);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this listing.");
      setSaving(false);
    }
  }

  return (
    <>
      <Link href={back} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"><ArrowLeft className="size-4" /> My listings</Link>
      <h1 className="board-title">{tool ? "Edit listing" : "List a tool"}</h1>
      <p className="board-intro">Signed-in neighbors will see this. You approve every request.</p>
      <div className="grid items-start gap-6 min-[960px]:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <form onSubmit={submit} className="grid gap-[26px] rounded-[14px] border bg-white p-5 sm:p-7">
          <label className="grid gap-2 text-sm font-semibold">Tool name
            <Input className="h-11" required maxLength={Math.max(60, tool?.name.length ?? 0)} value={form.name} placeholder="e.g. Cordless drill" onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Category</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <label key={category} className="flex min-h-[38px] cursor-pointer items-center rounded-full border border-input px-3.5 text-sm has-checked:border-primary has-checked:bg-primary has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2">
                  <input type="radio" className="sr-only" name="category" checked={form.category === category} onChange={() => setForm({ ...form, category })} />
                  {formatCategory(category)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Condition</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CONDITIONS.map((condition) => (
                <label key={condition} className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-input p-3 text-sm has-checked:border-primary has-checked:bg-muted">
                  <input className="mt-0.5 size-[18px] shrink-0 accent-primary" type="radio" name="condition" value={condition} checked={form.condition === condition} onChange={() => setForm({ ...form, condition })} />
                  <span className="grid gap-0.5"><strong>{formatCondition(condition)}</strong><span className="text-[13px] text-muted-foreground">{conditionDetails[condition]}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-2 text-sm font-semibold"><span className="flex justify-between gap-2">Short description <span className="font-normal text-muted-foreground">{form.description.length} / {Math.max(200, tool?.description.length ?? 0)}</span></span>
            <Textarea required rows={4} maxLength={Math.max(200, tool?.description.length ?? 0)} value={form.description} placeholder="What is included, and what should a borrower know?" onChange={(event) => setForm({ ...form, description: event.target.value })} />
            <span className="font-normal text-muted-foreground">Leave out your address and phone number.</span>
          </label>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">Photo <span className="font-normal text-muted-foreground">(optional)</span></legend>
            <Input
              type="file"
              accept={LISTING_PHOTO_TYPES.join(",")}
              aria-label="Listing photo"
              aria-describedby="listing-photo-help"
              disabled={saving}
              className="h-auto min-h-11 cursor-pointer py-2 file:mr-3"
              onChange={(event) => {
                choosePhoto(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            <p id="listing-photo-help" className="text-sm text-muted-foreground">One JPEG, PNG, or WebP up to 2 MB.</p>
            {photo && <p className="break-all text-sm">{photo.file.name}</p>}
            {photoError && <p role="alert" className="text-sm text-destructive">{photoError}</p>}
            {previewUrl && (
              <Button type="button" variant="ghost" size="sm" className="w-fit" disabled={saving} onClick={() => { setPhoto(null); setPhotoError(""); }}>Remove photo</Button>
            )}
            {photo === null && tool?.photoUrl && (
              <Button type="button" variant="ghost" size="sm" className="w-fit" disabled={saving} onClick={() => setPhoto(undefined)}>Keep original photo</Button>
            )}
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
            <Link className={buttonVariants({ variant: "outline" })} href={back}>Cancel</Link>
            <Button type="submit" disabled={saving || !form.name.trim() || !form.description.trim()}>{saving ? "Saving…" : tool ? "Save changes" : "Publish listing"}</Button>
          </div>
        </form>
        <aside className="grid gap-3">
          <h2 className="text-[13px] font-semibold text-muted-foreground">How neighbors will see it</h2>
          <div className="grid gap-3.5 rounded-[14px] border bg-white p-[18px]">
            {previewUrl && <ListingPhoto src={previewUrl} name={form.name.trim()} />}
            <div className="flex items-center justify-between gap-2"><ToolIcon category={form.category} /><Availability available={tool?.isAvailable ?? true} /></div>
            <div><h3 className="text-lg font-semibold">{form.name || "Tool name"}</h3><p className="text-sm text-muted-foreground">{formatCategory(form.category)} · {formatCondition(form.condition)}</p></div>
            <p className="break-words text-sm text-muted-foreground">{form.description || "Your short description appears here."}</p>
            {user?.fullName && <p className="border-t pt-3 text-sm text-muted-foreground">Lent by {user.fullName}</p>}
            <span className={buttonVariants({ variant: "outline" })}>Request to borrow</span>
          </div>
          {!tool && <p className="text-[13px] text-muted-foreground">New listings start as Available. You&apos;re notified about every request.</p>}
        </aside>
      </div>
    </>
  );
}
