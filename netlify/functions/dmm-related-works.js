"use strict";

const DMM_API_URL = "https://api.dmm.com/affiliate/v3/ItemList";
const SEARCH_KEYWORD = "華宮椎奈";

function emptyResponse() {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600"
    },
    body: JSON.stringify({ works: [] })
  };
}

function isAllowedDmmUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "dmm.com" || host.endsWith(".dmm.com") ||
      host === "dmm.co.jp" || host.endsWith(".dmm.co.jp") ||
      host === "fanza.com" || host.endsWith(".fanza.com")
    );
  } catch {
    return false;
  }
}

exports.handler = async function handler(event) {
  if (event?.httpMethod && event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { Allow: "GET" }, body: "" };
  }

  const apiId = process.env.DMM_API_ID;
  const affiliateId = process.env.DMM_AFFILIATE_ID;
  if (!apiId || !affiliateId) return emptyResponse();

  const requestUrl = new URL(DMM_API_URL);
  requestUrl.search = new URLSearchParams({
    api_id: apiId,
    affiliate_id: affiliateId,
    site: "FANZA",
    service: "digital",
    floor: "videoa",
    hits: "3",
    sort: "date",
    keyword: SEARCH_KEYWORD,
    output: "json"
  }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(requestUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) return emptyResponse();

    const payload = await response.json();
    const items = Array.isArray(payload?.result?.items) ? payload.result.items : [];
    const works = items.slice(0, 3).map(item => {
      const image = item?.imageURL?.large || item?.imageURL?.list || item?.imageURL?.small || "";
      const affiliateUrl = item?.affiliateURL || "";
      if (!item?.title || !isAllowedDmmUrl(image) || !isAllowedDmmUrl(affiliateUrl)) return null;
      return {
        title: String(item.title),
        releaseDate: item.date ? String(item.date) : "",
        image,
        affiliateUrl
      };
    }).filter(Boolean);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=3600"
      },
      body: JSON.stringify({ works })
    };
  } catch {
    return emptyResponse();
  } finally {
    clearTimeout(timeout);
  }
};
