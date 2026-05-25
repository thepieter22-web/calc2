// src/app/api/ai/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY environment variable" },
        { status: 500 }
      );
    }

    // Call OpenAI Responses API
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt ?? "Generate a short preview text for a custom logomat design.",
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return NextResponse.json(
        { error: "OpenAI request failed", details: errText },
        { status: 500 }
      );
    }

    const data = await r.json();

    // "output_text" is commonly present in Responses API results
    const text =
      data?.output_text ??
      data?.output?.[0]?.content?.[0]?.text ??
      JSON.stringify(data);

    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
