import { NextResponse } from "next/server";

/**
 * Placeholder endpoint.
 * Later vervang je dit door een echte AI-provider en stuur je config + logo door.
 */
export async function POST(req: Request) {
  const body = await req.json();

  return NextResponse.json({
    ok: true,
    message:
      "AI preview is momenteel een placeholder. Koppel later een echte AI-provider in /api/ai-preview.",
    receivedKeys: Object.keys(body ?? {})
  });
}
