import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  const pathArray = params.path || [];
  const apiPath = pathArray.join("/");
  const { searchParams } = new URL(request.url);

  const apiKey = process.env.HOSHIYOMI_API_KEY || "";
  const targetUrl = `https://api.hoshiyomi.my.id/api/${apiPath}?${searchParams.toString()}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Content-Type": "application/json",
      },
      next: { revalidate: 300 } // Cache 5 menit di Vercel CDN
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Hoshiyomi API responded with status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to communicate with Hoshiyomi API server", details: err.message },
      { status: 500 }
    );
  }
}
