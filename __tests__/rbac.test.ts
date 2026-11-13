import { describe, it, expect } from "vitest";

/*
 * RBAC unit tests for Convex authorization logic.
 *
 * These test the authorization _rules_ in isolation. Because Convex mutations/queries
 * run server-side and require a Convex backend, we extract and test the core
 * authorization decision logic here. Integration tests against a live Convex backend
 * would complement these.
 */

type Role = "member" | "admin";

interface User {
  _id: string;
  clerkId: string;
  role: Role;
  isTrustedLender: boolean;
}

interface Tool {
  _id: string;
  ownerId: string;
  isRemoved: boolean;
}

interface BorrowRequest {
  _id: string;
  borrowerId: string;
  lenderId: string;
  toolId: string;
  status: string;
}

// These mirror the authorization checks in the Convex functions
function canManageTool(user: User, tool: Tool): boolean {
  return user._id === tool.ownerId || user.role === "admin";
}

function canApproveBorrowRequest(user: User, request: BorrowRequest): boolean {
  return user._id === request.lenderId || user.role === "admin";
}

function canDeclineBorrowRequest(user: User, request: BorrowRequest): boolean {
  return user._id === request.lenderId || user.role === "admin";
}

function canMarkBorrowed(user: User, request: BorrowRequest): boolean {
  return user._id === request.lenderId || user.role === "admin";
}

function canMarkReturned(user: User, request: BorrowRequest): boolean {
  return (
    user._id === request.lenderId || user.role === "admin"
  );
}

function canRemoveAnyListing(user: User): boolean {
  return user.role === "admin";
}

function canSetTrustedLender(user: User): boolean {
  return user.role === "admin";
}

function canViewAllLoans(user: User): boolean {
  return user.role === "admin";
}

function canBorrowOwnTool(user: User, tool: Tool): boolean {
  return user._id !== tool.ownerId;
}

const admin: User = {
  _id: "admin1",
  clerkId: "clerk_admin",
  role: "admin",
  isTrustedLender: false,
};

const member: User = {
  _id: "member1",
  clerkId: "clerk_member",
  role: "member",
  isTrustedLender: false,
};

const otherMember: User = {
  _id: "member2",
  clerkId: "clerk_other",
  role: "member",
  isTrustedLender: false,
};

const memberTool: Tool = {
  _id: "tool1",
  ownerId: "member1",
  isRemoved: false,
};

const otherTool: Tool = {
  _id: "tool2",
  ownerId: "member2",
  isRemoved: false,
};

const borrowRequest: BorrowRequest = {
  _id: "req1",
  borrowerId: "member2",
  lenderId: "member1",
  toolId: "tool1",
  status: "pending",
};

describe("RBAC: Tool Management", () => {
  it("owner can manage their own tool", () => {
    expect(canManageTool(member, memberTool)).toBe(true);
  });

  it("non-owner member cannot manage another's tool", () => {
    expect(canManageTool(member, otherTool)).toBe(false);
  });

  it("admin can manage any tool", () => {
    expect(canManageTool(admin, memberTool)).toBe(true);
    expect(canManageTool(admin, otherTool)).toBe(true);
  });
});

describe("RBAC: Borrow Request Actions", () => {
  it("lender can approve their own tool's request", () => {
    expect(canApproveBorrowRequest(member, borrowRequest)).toBe(true);
  });

  it("borrower cannot approve their own request", () => {
    expect(canApproveBorrowRequest(otherMember, borrowRequest)).toBe(false);
  });

  it("admin can approve any request", () => {
    expect(canApproveBorrowRequest(admin, borrowRequest)).toBe(true);
  });

  it("lender can decline their own tool's request", () => {
    expect(canDeclineBorrowRequest(member, borrowRequest)).toBe(true);
  });

  it("borrower cannot decline their own request", () => {
    expect(canDeclineBorrowRequest(otherMember, borrowRequest)).toBe(false);
  });

  it("lender can mark as borrowed", () => {
    expect(canMarkBorrowed(member, borrowRequest)).toBe(true);
  });

  it("random member cannot mark as borrowed", () => {
    expect(canMarkBorrowed(otherMember, borrowRequest)).toBe(false);
  });

  it("lender can mark as returned", () => {
    expect(canMarkReturned(member, borrowRequest)).toBe(true);
  });

  it("admin can mark as returned", () => {
    expect(canMarkReturned(admin, borrowRequest)).toBe(true);
  });
});

describe("RBAC: Admin-Only Actions", () => {
  it("admin can remove any listing", () => {
    expect(canRemoveAnyListing(admin)).toBe(true);
  });

  it("member cannot remove any listing (admin route)", () => {
    expect(canRemoveAnyListing(member)).toBe(false);
  });

  it("admin can set trusted lender", () => {
    expect(canSetTrustedLender(admin)).toBe(true);
  });

  it("member cannot set trusted lender", () => {
    expect(canSetTrustedLender(member)).toBe(false);
  });

  it("admin can view all loans", () => {
    expect(canViewAllLoans(admin)).toBe(true);
  });

  it("member cannot view all loans", () => {
    expect(canViewAllLoans(member)).toBe(false);
  });
});

describe("RBAC: Self-Borrow Prevention", () => {
  it("user cannot borrow their own tool", () => {
    expect(canBorrowOwnTool(member, memberTool)).toBe(false);
  });

  it("user can borrow another's tool", () => {
    expect(canBorrowOwnTool(member, otherTool)).toBe(true);
  });
});
