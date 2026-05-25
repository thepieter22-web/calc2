// src/app/api/ai-preview/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "ai-preview endpoint is live. Use POST for AI generation.",
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, message: "Missing OPENAI_API_KEY in Vercel environment variables." },
        { status: 500 }
      );
    }

    // We maken een prompt op basis van de configuratie die jouw app al kan tonen als JSON.
    // (Je kan dit later verfijnen.)
    const prompt =
      body?.prompt ??
      `Maak een korte, duidelijke AI preview voor deze logomat-configuratie (kleur, maat, rand, plaatsing en logo-instellingen). 
Geef 3 suggesties voor een betere layout en 2 korte marketing zinnen.
Configuratie:
${JSON.stringify(body, null, 2)}`;

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
        { ok: false, message: "OpenAI request failed", details },
        { status: 500 }
      );
    }

    const data = await r.json();

    // Responses API: vaak zit de tekst in output_text
    const text =
      data?.output_text ??
      data?.output?.[0]?.content?.[0]?.text ??
      "No text returned from model.";

    // BELANGRIJK: stuur terug in `message` zodat je UI het zeker toont
    return NextResponse.json({ ok: true, message: text });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: "Server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
