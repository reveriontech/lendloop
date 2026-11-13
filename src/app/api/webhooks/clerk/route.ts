import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Clerk webhook handler for user sync
  // In production, verify with Svix signature
  try {
    const body = await req.json();
    const eventType = body.type;

    if (eventType === "user.created" || eventType === "user.updated") {
      // User sync is handled client-side via upsertUser on sign-in
      // This endpoint exists as a fallback for server-side sync
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
