import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  const pathArray = params.path || [];
  const { searchParams } = new URL(request.url);

  // PROXY KHUSUS SUBTITLE (Bypass CORS & Convert SRT -> VTT)
  if (pathArray[0] === "proxy-sub") {
    const subUrl = searchParams.get("url");
    if (!subUrl) return new NextResponse("", { status: 400 });
    
    try {
      const subRes = await fetch(subUrl);
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

  // PROXY API HOSHIYOMI
  const apiPath = pathArray.join("/");
  
  // Menggunakan API Key milikmu secara langsung sebagai jaminan
  const apiKey = process.env.HOSHIYOMI_API_KEY || "HOSHIYOMI-PRE-5b2451a5";

  if (!searchParams.has("apikey")) {
    searchParams.append("apikey", apiKey);
  }

  const targetUrl = `https://api.hoshiyomi.my.id/api/${apiPath}?${searchParams.toString()}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: { "X-API-Key": apiKey }
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Gagal terhubung ke Hoshiyomi API", details: err.message },
      { status: 500 }
    );
  }
}
