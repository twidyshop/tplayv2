import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  const routeParams = await params;
  const pathArray = routeParams.path || [];
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

  // Stream resource proxy adapted from Tplaysansekai: relay HLS manifests and
  // rewrite every segment/key/child-playlist URL back through this same proxy.
  if (pathArray[1] === "proxy") {
    const target = searchParams.get("url");
    if (!target) return NextResponse.json({ error: "Parameter url wajib diisi." }, { status: 400 });
    let mediaUrl;
    try {
      mediaUrl = new URL(target);
      if (!["https:", "http:"].includes(mediaUrl.protocol)) throw new Error("invalid protocol");
    } catch {
      return NextResponse.json({ error: "URL media tidak valid." }, { status: 400 });
    }
    const sourcePlatform = pathArray[0] || "";
    const referer = sourcePlatform === "wetv" ? "https://wetv.vip/" :
      sourcePlatform === "iqiyi" ? "https://www.iq.com/" :
      sourcePlatform.startsWith("dramabox") ? "https://www.dramabox.com/" :
      mediaUrl.origin + "/";
    const origin = sourcePlatform === "wetv" ? "https://wetv.vip" :
      sourcePlatform === "iqiyi" ? "https://www.iq.com" : "";
    try {
      const headers = new Headers({ Accept: "*/*", "Accept-Encoding": "identity", Referer: referer, "User-Agent": request.headers.get("user-agent") || "Mozilla/5.0" });
      if (origin) headers.set("Origin", origin);
      const range = request.headers.get("range");
      if (range) headers.set("Range", range);
      const upstream = await fetch(mediaUrl.toString(), { headers, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(25000) });
      const type = upstream.headers.get("content-type") || "";
      const finalUrl = upstream.url || mediaUrl.toString();
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS", "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges,Content-Type", "Cache-Control": "no-store" };
      let manifestBody = null;
      let isManifest = /mpegurl|vnd\.apple\.mpegurl/i.test(type) || /\.m3u8(?:[?#]|$)/i.test(finalUrl) || /\.m3u8(?:[?#]|$)/i.test(mediaUrl.toString());
      if (!isManifest && upstream.ok) {
        try {
          const probe = await upstream.clone().text();
          if (/^\s*#EXTM3U/i.test(probe) || /#EXT-X-(?:VERSION|STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE)/i.test(probe)) {
            isManifest = true;
            manifestBody = probe;
          }
        } catch {}
      }
      if (isManifest) {
        const body = manifestBody ?? await upstream.text();
        const rewritten = upstream.ok ? body.split(/\r?\n/).map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          const rewrite = raw => {
            try { return new URL("/api/hoshiyomi/" + sourcePlatform + "/proxy?url=" + encodeURIComponent(new URL(raw, finalUrl).toString()), request.url).toString(); }
            catch { return raw; }
          };
          if (trimmed.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, raw) => 'URI="' + rewrite(raw) + '"');
          return rewrite(trimmed);
        }).join("\n") : body;
        return new NextResponse(rewritten, { status: upstream.status, headers: { ...cors, "Content-Type": type || "application/vnd.apple.mpegurl" } });
      }
      const out = new Headers(cors);
      for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
        const value = upstream.headers.get(key); if (value) out.set(key, value);
      }
      if (upstream.status === 206 && !out.has("content-range")) out.delete("content-length");
      return new NextResponse(upstream.body, { status: upstream.status, headers: out });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mengambil resource video." }, { status: 502 });
    }
  }

  // Normalize aliases to the documented Hoshiyomi endpoints used by Tplaysansekai.
  const useV2 = pathArray[0] === "v2";
  const apiParts = (useV2 ? pathArray.slice(1) : [...pathArray]);
  const sourcePlatform = apiParts[0] || "";
  const requestedAction = apiParts[1] || "";
  // Hoshiyomi uses /allepisode for episode lists; /episodes is not a valid
  // upstream endpoint for these platforms and returns 400.
  if (requestedAction === "episodes") apiParts[1] = "allepisode";
  const apiPath = apiParts.join("/");
  
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
  // Match the known-good iQIYI detail parameters from Tplaysansekai.
  if (sourcePlatform === "iqiyi" && requestedAction === "detail") {
    searchParams.set("lang", "idid");
    searchParams.set("language", "id_id");
    searchParams.set("region", "id");
  }
  const apiHost = useV2 ? "https://apiv2.hoshiyomi.my.id" : "https://api.hoshiyomi.my.id";
  const query = searchParams.toString();
  const targetUrl = `${apiHost}/api/${apiPath}${query ? "?" + query : ""}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(20000),
      cache: "no-store"
    });

    const body = await res.text();
    // Log upstream failure details in Vercel, without exposing the API key.
    if (!res.ok) {
      console.error("[Hoshiyomi proxy]", apiPath, res.status, body.slice(0, 500));
    }
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
