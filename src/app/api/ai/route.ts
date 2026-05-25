import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in environment variables" },
        { status: 500 }
      );
    }

    // Je UI kan config/logo info meesturen; we gebruiken dat als input
    const prompt =
      body?.prompt ??
      `Maak een korte AI preview/omschrijving voor deze logomat-configuratie:\n${JSON.stringify(body, null, 2)}`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
      }),
    });

    if (!r.ok) {
      const details = await r.text();
      return NextResponse.json(
        { error: "OpenAI request failed", details },
        { status: 500 }
      );
    }

    const data = await r.json();
    const text =
      data?.output_text ??
      data?.output?.[0]?.content?.[0]?.text ??
      "No text returned";

    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
