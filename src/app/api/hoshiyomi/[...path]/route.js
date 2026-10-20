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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithBackoff(url, apiKey, maxAttempts = 3) {
  let attempt = 0;
  let backoffMs = 2000;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          "User-Agent": "TPLAY-Web-Client/1.0",
          "Content-Type": "application/json",
        },
        next: { revalidate: 900 }
      });

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("Retry-After");
        let waitTimeMs = backoffMs;

        if (retryAfterHeader) {
          const parsedSeconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
            waitTimeMs = parsedSeconds * 1000;
          }
        }

        if (attempt < maxAttempts) {
          await delay(waitTimeMs);
          backoffMs *= 2;
          continue;
        }
      }

      return response;
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      await delay(backoffMs);
      backoffMs *= 2;
    }
  }

  throw new Error("Max retries exceeded for Hoshiyomi API");
}

export async function GET(request, { params }) {
  const pathArray = params.path || [];
  const apiPath = pathArray.join("/");
  const { searchParams } = new URL(request.url);

  const apiKey = process.env.HOSHIYOMI_API_KEY || "";

  // Lampirkan apikey ke query string backend
  if (apiKey && !searchParams.has("apikey")) {
    searchParams.append("apikey", apiKey);
  }

  const cacheKey = `${apiPath}?${searchParams.toString()}`;

  const cached = getCachedData(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache-Status": "HIT" }
    });
  }

  const queryString = searchParams.toString();
  const targetUrl = `https://api.hoshiyomi.my.id/api/${apiPath}${queryString ? `?${queryString}` : ""}`;

  try {
    const res = await fetchWithBackoff(targetUrl, apiKey);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Hoshiyomi API Error: Status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    setCachedData(cacheKey, data);

    return NextResponse.json(data, {
      headers: { "X-Cache-Status": "MISS" }
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Gagal terhubung ke Hoshiyomi API", details: err.message },
      { status: 500 }
    );
  }
}
