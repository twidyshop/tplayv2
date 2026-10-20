import { NextResponse } from "next/server";

// Simple Server-side In-Memory Cache
const apiCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 menit

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

// Utility delay helper
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch dengan Exponential Backoff + Retry-After Handling untuk status 429
async function fetchWithBackoff(url, apiKey, maxAttempts = 3) {
  let attempt = 0;
  let backoffMs = 2000; // Mulai dari 2 detik

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
        // Caching tambahan di Next.js Data Cache
        next: { revalidate: 900 }
      });

      if (response.status === 429) {
        // Ambil Retry-After dari header Hoshiyomi (dalam detik)
        const retryAfterHeader = response.headers.get("Retry-After");
        let waitTimeMs = backoffMs;

        if (retryAfterHeader) {
          const parsedSeconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
            waitTimeMs = parsedSeconds * 1000;
          }
        }

        console.warn([Hoshiyomi 429 Rate Limit] Waiting ${waitTimeMs}ms before retry attempt ${attempt}/${maxAttempts});
        
        if (attempt < maxAttempts) {
          await delay(waitTimeMs);
          backoffMs *= 2; // Exponential backoff (2s -> 4s -> 8s)
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

  const cacheKey = `${apiPath}?${searchParams.toString()}`;
  const apiKey = process.env.HOSHIYOMI_API_KEY || "";

  // 1. CEK SERVER-SIDE CACHE DAHULU
  const cached = getCachedData(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache-Status": "HIT" }
    });
  }

  const targetUrl = `https://api.hoshiyomi.my.id/api/${apiPath}?${searchParams.toString()}`;

  try {
    // 2. FETCH DENGAN RETRY & BACKOFF
    const res = await fetchWithBackoff(targetUrl, apiKey);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Hoshiyomi API Error: Status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    // 3. SIMPAN KE CACHE JIKA SUKSES
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
