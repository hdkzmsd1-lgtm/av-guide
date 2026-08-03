"use strict";

const DMM_API_BASE_URL = "https://api.dmm.com/affiliate/v3/";
const TARGET_ACTRESS = "華宮椎奈";

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

function normalizeName(value) {
  return String(value || "").normalize("NFKC").replace(/[\s　]+/g, "");
}

async function fetchDmmJson(endpoint, params) {
  const requestUrl = new URL(endpoint, DMM_API_BASE_URL);
  requestUrl.search = new URLSearchParams(params).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(requestUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function findExactActressId(payload) {
  const candidates = Array.isArray(payload?.result?.actress) ? payload.result.actress : [];
  const target = normalizeName(TARGET_ACTRESS);
  const exactIds = [...new Set(candidates
    .filter(candidate => normalizeName(candidate?.name) === target)
    .map(candidate => String(candidate?.id || ""))
    .filter(Boolean))];
  return exactIds.length === 1 ? exactIds[0] : "";
}

function findFanzaVideoFloor(payload) {
  const sites = Array.isArray(payload?.result?.site) ? payload.result.site : [];
  const site = sites.find(candidate => candidate?.code === "FANZA");
  const services = Array.isArray(site?.service) ? site.service : [];
  const service = services.find(candidate => candidate?.code === "digital");
  const floors = Array.isArray(service?.floor) ? service.floor : [];
  const floor = floors.find(candidate => candidate?.code === "videoa");
  if (!site || !service || !floor) return null;
  return { site: site.code, service: service.code, floor: floor.code };
}

exports.handler = async function handler(event) {
  if (event?.httpMethod && event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { Allow: "GET" }, body: "" };
  }

  const apiId = process.env.DMM_API_ID;
  const affiliateId = process.env.DMM_AFFILIATE_ID;
  if (!apiId || !affiliateId) return emptyResponse();

  const auth = { api_id: apiId, affiliate_id: affiliateId, output: "json" };

  try {
    const actressPayload = await fetchDmmJson("ActressSearch", {
      ...auth,
      keyword: TARGET_ACTRESS,
      hits: "100"
    });
    const actressId = findExactActressId(actressPayload);
    if (!actressId) return emptyResponse();

    const floorPayload = await fetchDmmJson("FloorList", auth);
    const fanzaVideo = findFanzaVideoFloor(floorPayload);
    if (!fanzaVideo) return emptyResponse();

    const payload = await fetchDmmJson("ItemList", {
      ...auth,
      ...fanzaVideo,
      article: "actress",
      article_id: actressId,
      hits: "3",
      sort: "date"
    });
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
  }
};
