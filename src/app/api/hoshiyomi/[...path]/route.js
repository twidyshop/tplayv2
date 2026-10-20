import { NextResponse } from "next/server";

const apiCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getCachedData(key) {
  const cached = apiCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    apiCache.delete(key);
    return null;
  }
  return cached.data;
}

function setCachedData(key, data) {
  apiCache.set(key, { data, timestamp: Date.now() });
}

export async function GET(request, { params }) {
  const pathArray = params.path || [];
  const { searchParams } = new URL(request.url);

  // PROXY KHUSUS BYPASS CORS SUBTITLE
  if (pathArray[0] === "proxy-sub") {
    const subUrl = searchParams.get("url");
    try {
      const subRes = await fetch(subUrl);
      const text = await subRes.text();
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

  const apiPath = pathArray.join("/");
  const apiKey = process.env.HOSHIYOMI_API_KEY || "";

  if (apiKey && !searchParams.has("apikey")) {
    searchParams.append("apikey", apiKey);
  }

  const cacheKey = `${apiPath}?${searchParams.toString()}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache-Status": "HIT" } });
  }

  const targetUrl = `https://api.hoshiyomi.my.id/api/${apiPath}?${searchParams.toString()}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "User-Agent": "TPLAY-Web-Client/1.0",
      }
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `API Error: Status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    setCachedData(cacheKey, data);
    return NextResponse.json(data, { headers: { "X-Cache-Status": "MISS" } });

  } catch (err) {
    return NextResponse.json(
      { error: "Gagal terhubung ke Hoshiyomi API" },
      { status: 500 }
    );
  }
}
