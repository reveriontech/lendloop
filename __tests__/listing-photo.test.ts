import { describe, expect, it, vi } from "vitest";
import { create, update } from "../convex/tools";
import type { MutationCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import { LISTING_PHOTO_MAX_BYTES } from "../convex/listingPhoto";

const clerkId = "clerk-photo-owner";
const ownerId = "photo-owner" as Id<"users">;
const toolId = "photo-tool" as Id<"tools">;
const oldPhoto = "old-photo" as Id<"_storage">;
const newPhoto = "new-photo" as Id<"_storage">;
const fields = { name: "Drill", condition: "good", category: "power_tools", description: "With case" };
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;

function fixture(owner = ownerId) {
  const db = {
    query: vi.fn(() => ({ withIndex: () => ({ unique: async () => ({ _id: ownerId, role: "member" }) }) })),
    get: vi.fn().mockResolvedValue({ _id: toolId, ownerId: owner, photoId: oldPhoto, isRemoved: false }),
    insert: vi.fn().mockResolvedValue(toolId),
    patch: vi.fn().mockResolvedValue(undefined),
  };
  const storage = { store: vi.fn().mockResolvedValue(newPhoto), delete: vi.fn().mockResolvedValue(undefined) };
  const ctx = { db, storage, auth: { getUserIdentity: async () => ({ subject: clerkId }) } } as unknown as MutationCtx;
  return { ctx, db, storage };
}

function run<Args, Result>(mutation: unknown, ctx: MutationCtx, args: Args): Promise<Result> {
  // Invoke the registered handler with a fake Convex context.
  return (mutation as { _handler: (ctx: MutationCtx, args: Args) => Promise<Result> })._handler(ctx, args);
}

describe("listing photos", () => {
  it("creates a listing with one stored raster photo", async () => {
    const { ctx, db, storage } = fixture();
    await expect(run(create, ctx, { clerkId, ...fields, photo: png })).resolves.toBe(toolId);
    expect(storage.store).toHaveBeenCalledOnce();
    expect(storage.store.mock.calls[0][0]).toMatchObject({ type: "image/png", size: 8 });
    expect(db.insert).toHaveBeenCalledWith("tools", expect.objectContaining({ photoId: newPhoto }));
  });

  it("leaves an existing photo alone for a text-only edit", async () => {
    const { ctx, db, storage } = fixture();
    await run(update, ctx, { clerkId, toolId, name: "Cordless drill" });
    expect(db.patch).toHaveBeenCalledWith(toolId, { name: "Cordless drill" });
    expect(storage.store).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("replaces or removes the old photo", async () => {
    const replaced = fixture();
    await run(update, replaced.ctx, { clerkId, toolId, photo: png });
    expect(replaced.db.patch).toHaveBeenCalledWith(toolId, { photoId: newPhoto });
    expect(replaced.storage.delete).toHaveBeenCalledWith(oldPhoto);

    const removed = fixture();
    await run(update, removed.ctx, { clerkId, toolId, photo: null });
    expect(removed.db.patch).toHaveBeenCalledWith(toolId, { photoId: undefined });
    expect(removed.storage.delete).toHaveBeenCalledWith(oldPhoto);
  });

  it("rejects non-image and oversized files before changing storage or listing data", async () => {
    const { ctx, db, storage } = fixture();
    await expect(run(update, ctx, { clerkId, toolId, photo: new TextEncoder().encode("<svg>").buffer })).rejects.toThrow("JPEG, PNG, or WebP");
    await expect(run(update, ctx, { clerkId, toolId, photo: new ArrayBuffer(LISTING_PHOTO_MAX_BYTES + 1) })).rejects.toThrow("2 MB");
    expect(storage.store).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("checks listing ownership before storing a replacement", async () => {
    const { ctx, db, storage } = fixture("different-owner" as Id<"users">);
    await expect(run(update, ctx, { clerkId, toolId, photo: png })).rejects.toThrow("only manage your own tools");
    expect(storage.store).not.toHaveBeenCalled();
    expect(db.patch).not.toHaveBeenCalled();
  });
});
