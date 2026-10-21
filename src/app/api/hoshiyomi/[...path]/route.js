import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  const pathArray = params.path || [];
  const { searchParams } = new URL(request.url);

  // PROXY KHUSUS SUBTITLE (Bypass CORS & Convert SRT -> VTT)
  if (pathArray[0] === "proxy-sub") {
    const subUrl = searchParams.get("url");
    if (!subUrl) return new NextResponse("Missing subtitle URL", { status: 400 });

    let parsedSubUrl;
    try {
      parsedSubUrl = new URL(subUrl);
      if (parsedSubUrl.protocol !== "https:") {
        return new NextResponse("Only HTTPS subtitle URLs are allowed", { status: 400 });
      }
    } catch {
      return new NextResponse("Invalid subtitle URL", { status: 400 });
    }

    try {
      const subRes = await fetch(parsedSubUrl.toString(), { signal: AbortSignal.timeout(10000) });
      if (!subRes.ok) return new NextResponse("Subtitle provider error", { status: 502 });
      let text = await subRes.text();
      
      // Jika formatnya SRT, paksa ubah jadi WEBVTT agar tombol CC HTML5 muncul
      if (!text.includes("WEBVTT")) {
        text = "WEBVTT\n\n" + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
      }
      
      return new NextResponse(text, {
        headers: {
          "Content-Type": "text/vtt",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (e) {
      return new NextResponse("", { status: 500 });
    }
  }

  // Proxy API Hoshiyomi; /v2 routes to the normalized playback API.
  const useV2 = pathArray[0] === "v2";
  const apiPath = (useV2 ? pathArray.slice(1) : pathArray).join("/");
  
  // Keep the paid API key server-side in Vercel Environment Variables.
  const apiKey = process.env.HOSHIYOMI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "HOSHIYOMI_API_KEY belum diatur di environment server." },
      { status: 500 }
    );
  }

  // Never forward a caller-supplied key to the upstream provider.
  searchParams.delete("apikey");
  searchParams.delete("api_key");
  const apiHost = useV2 ? "https://apiv2.hoshiyomi.my.id" : "https://api.hoshiyomi.my.id";
  const targetUrl = `${apiHost}/api/${apiPath}?${searchParams.toString()}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(20000),
      cache: "no-store"
    });

    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Gagal terhubung ke Hoshiyomi API", details: err.message },
      { status: 500 }
    );
  }
}
