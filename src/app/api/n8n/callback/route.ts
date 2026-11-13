import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/lib/hmac";

const N8N_HMAC_SECRET = process.env.N8N_HMAC_SECRET || "";
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-signature") || "";
  const timestamp = req.headers.get("x-timestamp") || "";
  const bodyStr = await req.text();

  const result = verifySignature(bodyStr, signature, timestamp, N8N_HMAC_SECRET);
  if (!result.valid) {
    return NextResponse.json(
      { error: "Signature verification failed", detail: result.error },
      { status: 401 }
    );
  }

  try {
    const body = JSON.parse(bodyStr);
    const { borrowRequestId, type, message, idempotencyKey } = body;

    if (!borrowRequestId || !type || !message || !idempotencyKey) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const convexUrl = CONVEX_URL.replace(".cloud", ".site");
    const response = await fetch(`${convexUrl}/api/automation-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ borrowRequestId, type, message, idempotencyKey }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: "Convex write failed", detail: err }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
