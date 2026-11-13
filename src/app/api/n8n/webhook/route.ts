import { NextRequest, NextResponse } from "next/server";
import { signPayload } from "@/lib/hmac";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const N8N_HMAC_SECRET = process.env.N8N_HMAC_SECRET || "";

export async function POST(req: NextRequest) {
  if (!N8N_WEBHOOK_URL) {
    console.warn("N8N_WEBHOOK_URL not configured, skipping webhook");
    return NextResponse.json({ skipped: true, reason: "N8N_WEBHOOK_URL not set" });
  }

  try {
    const body = await req.json();
    const bodyStr = JSON.stringify(body);
    const { signature, timestamp } = signPayload(bodyStr, N8N_HMAC_SECRET);

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signature,
        "X-Timestamp": timestamp,
      },
      body: bodyStr,
    });

    if (!response.ok) {
      console.error("n8n webhook failed:", response.status);
      return NextResponse.json({ error: "Webhook delivery failed" }, { status: 502 });
    }

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("n8n webhook error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
