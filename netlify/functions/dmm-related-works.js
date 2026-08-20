"use strict";

const DMM_API_BASE_URL = "https://api.dmm.com/affiliate/v3/";
const DEFAULT_ACTRESS = "華宮椎奈";
const NAGISA_ACTRESS = "渚このみ";
const HONJO_ACTRESS = "本庄ひな";
const HONJO_ALIAS = "菊川みつ葉";
const NANASE_ACTRESS = "七瀬そら";
const NANASE_ALIAS = "羽澄うい";
const ACTRESS_ALIASES = {
  "日向ゆら": ["NONOKA", "ののか"],
  "本庄ひな": [HONJO_ALIAS],
  "七瀬そら": [NANASE_ALIAS]
};

function jsonResponse(body, cacheControl) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl
    },
    body: JSON.stringify(body)
  };
}

function emptyResponse() {
  return jsonResponse({ works: [] }, "public, max-age=300, s-maxage=3600");
}

function isOfficialDmmHost(host) {
  return host === "dmm.com" || host.endsWith(".dmm.com") ||
    host === "dmm.co.jp" || host.endsWith(".dmm.co.jp") ||
    host === "fanza.com" || host.endsWith(".fanza.com") ||
    host === "fanza.co.jp" || host.endsWith(".fanza.co.jp");
}

function inspectDmmUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  const result = {
    hasUrl: Boolean(raw),
    protocol: null,
    host: null,
    allowedBeforeNormalization: false,
    allowedAfterNormalization: false,
    normalizedUrl: ""
  };
  if (!raw) return result;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const officialHost = isOfficialDmmHost(host);
    result.protocol = url.protocol;
    result.host = host;
    result.allowedBeforeNormalization = url.protocol === "https:" && officialHost;
    if (url.protocol === "http:" && officialHost) url.protocol = "https:";
    result.allowedAfterNormalization = url.protocol === "https:" && officialHost;
    if (result.allowedAfterNormalization) result.normalizedUrl = url.toString();
  } catch {
    // Invalid and empty URLs remain rejected without exposing their value.
  }
  return result;
}

function selectAllowedDmmUrl(values) {
  const inspections = values.map(inspectDmmUrl);
  return inspections.find(candidate => candidate.allowedAfterNormalization) ||
    inspections.find(candidate => candidate.hasUrl) ||
    inspectDmmUrl("");
}

function selectWorkImage(item, preferredSizes) {
  const available = {
    large: selectAllowedDmmUrl([item?.imageURL?.large]),
    list: selectAllowedDmmUrl([item?.imageURL?.list]),
    small: selectAllowedDmmUrl([item?.imageURL?.small])
  };
  for (const size of preferredSizes) {
    const candidate = available[size];
    if (candidate?.allowedAfterNormalization && candidate.normalizedUrl) return candidate.normalizedUrl;
  }
  return [available.large, available.list, available.small].find(candidate => candidate?.allowedAfterNormalization && candidate.normalizedUrl)?.normalizedUrl || "";
}

function normalizeName(value) {
  return String(value || "").normalize("NFKC").replace(/[\s　]+/g, "");
}

function scoreWorkTitle(title, actress) {
  const normalizedTitle = normalizeName(title).toLowerCase();
  const normalizedActress = normalizeName(actress).toLowerCase();
  let score = normalizedActress && normalizedTitle.includes(normalizedActress) ? 100 : 0;
  (ACTRESS_ALIASES[actress] || []).forEach(alias => {
    if (normalizeName(alias) && normalizedTitle.includes(normalizeName(alias).toLowerCase())) score += 35;
  });
  ["12人", "総集編", "ベスト", "大全", "コンプリート", "狙われた", "女の子たち", "複数", "オムニバス"].forEach(keyword => {
    if (normalizedTitle.includes(normalizeName(keyword).toLowerCase())) score -= 20;
  });
  return score;
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
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { httpStatus: response.status, payload, requestFailed: false };
  } catch {
    return { httpStatus: null, payload: null, requestFailed: true };
  } finally {
    clearTimeout(timeout);
  }
}

function exactActressIds(payload, targetActress) {
  const candidates = Array.isArray(payload?.result?.actress) ? payload.result.actress : [];
  const target = normalizeName(targetActress);
  return [...new Set(candidates
    .filter(candidate => normalizeName(candidate?.name) === target)
    .map(candidate => String(candidate?.id || ""))
    .filter(Boolean))];
}

function itemMatchesActress(item, targetActress) {
  const target = normalizeName(targetActress).toLowerCase();
  if (!target) return false;
  const title = normalizeName(item?.title).toLowerCase();
  if (title.includes(target)) return true;
  const actresses = Array.isArray(item?.iteminfo?.actress) ? item.iteminfo.actress : [];
  return actresses.some(candidate => normalizeName(candidate?.name).toLowerCase().includes(target));
}

function inspectFanzaVideoFloor(payload) {
  const sites = Array.isArray(payload?.result?.site) ? payload.result.site : [];
  const site = sites.find(candidate => candidate?.code === "FANZA");
  const services = Array.isArray(site?.service) ? site.service : [];
  const service = services.find(candidate => candidate?.code === "digital");
  const floors = Array.isArray(service?.floor) ? service.floor : [];
  const floor = floors.find(candidate => candidate?.code === "videoa");
  return {
    found: { site: Boolean(site), service: Boolean(service), floor: Boolean(floor) },
    value: site && service && floor
      ? { site: site.code, service: service.code, floor: floor.code }
      : null
  };
}

function inspectFanzaMonoDvdFloor(payload) {
  const sites = Array.isArray(payload?.result?.site) ? payload.result.site : [];
  const site = sites.find(candidate => candidate?.code === "FANZA");
  const services = Array.isArray(site?.service) ? site.service : [];
  const service = services.find(candidate => candidate?.code === "mono");
  const floors = Array.isArray(service?.floor) ? service.floor : [];
  const floor = floors.find(candidate => candidate?.code === "dvd");
  return {
    found: { site: Boolean(site), service: Boolean(service), floor: Boolean(floor) },
    value: site && service && floor ? { site: site.code, service: service.code, floor: floor.code } : null
  };
}

exports.handler = async function handler(event) {
  const batchMode = event?.httpMethod === "POST" && event?.queryStringParameters?.mode === "representative-batch";
  if (batchMode) {
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
    const results = await Promise.all(items.map(async item => {
      const file = typeof item?.file === "string" ? item.file : "";
      const actressName = typeof item?.actressName === "string" ? item.actressName.trim() : "";
      if (!file || !actressName) return { file, actressName, matched: false, reason: "invalid_item" };
      const response = await exports.handler({ httpMethod: "GET", queryStringParameters: { actress: actressName } });
      let payload = {};
      try { payload = JSON.parse(response.body || "{}"); } catch { payload = {}; }
      const work = Array.isArray(payload.works) ? payload.works[0] : null;
      if (!work?.image) return { file, actressName, matched: false, reason: "no本人一致作品" };
      return {
        file,
        actressName,
        matched: true,
        representativeImageUrl: work.image,
        representativeImageAlt: `${actressName} 関連作品 PR`,
        source: "dmm",
        searchRoute: "normalRelatedWorks",
        title: work.title,
        matchReason: "title一致 または iteminfo.actress一致"
      };
    }));
    return jsonResponse({ ok: true, results }, "no-store");
  }
  if (event?.httpMethod && event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { Allow: "GET" }, body: "" };
  }

  const requestedActress = event?.queryStringParameters?.actress;
  const targetActress = requestedActress?.trim() || "";
  const apiId = process.env.DMM_API_ID || "";
  const affiliateId = process.env.DMM_AFFILIATE_ID || "";
  const finish = (works, stage, reason) => {
    return works.length ? jsonResponse({ works, actress: targetActress }, "public, max-age=300, s-maxage=3600") : emptyResponse();
  };

  if (!targetActress) return finish([], "request", "missing_actress_parameter");

  const actressParams = {
    api_id: apiId,
    affiliate_id: affiliateId,
    output: "json",
    keyword: targetActress,
    hits: "100"
  };

  if (!apiId || !affiliateId) return finish([], "environment", "missing_environment_variable");

  const auth = { api_id: apiId, affiliate_id: affiliateId, output: "json" };

  let actressResult = await fetchDmmJson("ActressSearch", actressParams);
  let actressCandidates = Array.isArray(actressResult.payload?.result?.actress)
    ? actressResult.payload.result.actress
    : [];
  let exactIds = exactActressIds(actressResult.payload, targetActress);
  if ((targetActress === HONJO_ACTRESS || targetActress === NANASE_ACTRESS) && exactIds.length === 0) {
    const alias = targetActress === HONJO_ACTRESS ? HONJO_ALIAS : NANASE_ALIAS;
    actressResult = await fetchDmmJson("ActressSearch", { ...actressParams, keyword: alias });
    actressCandidates = Array.isArray(actressResult.payload?.result?.actress)
      ? actressResult.payload.result.actress
      : [];
    exactIds = exactActressIds(actressResult.payload, alias);
  }
  if (actressResult.requestFailed) return finish([], "ActressSearch", "request_failed");
  if (!actressResult.payload) return finish([], "ActressSearch", "invalid_json_response");
  if (actressResult.httpStatus < 200 || actressResult.httpStatus >= 300) return finish([], "ActressSearch", "http_error");
  const keywordFallback = exactIds.length === 0;
  if (exactIds.length > 1) return finish([], "ActressSearch", "ambiguous_exact_match");
  const actressId = exactIds[0];

  const floorResult = await fetchDmmJson("FloorList", auth);
  const floorInspection = inspectFanzaVideoFloor(floorResult.payload);
  if (floorResult.requestFailed) return finish([], "FloorList", "request_failed");
  if (!floorResult.payload) return finish([], "FloorList", "invalid_json_response");
  if (floorResult.httpStatus < 200 || floorResult.httpStatus >= 300) return finish([], "FloorList", "http_error");
  if (!floorInspection.value) {
    const monoInspection = inspectFanzaMonoDvdFloor(floorResult.payload);
    if (!monoInspection.value) return finish([], "FloorList", "fanza_video_and_mono_dvd_floor_not_found");
    floorInspection.value = monoInspection.value;
  }

  const itemParameters = keywordFallback
    ? { ...auth, ...floorInspection.value, keyword: targetActress, hits: "20", sort: "date" }
    : { ...auth, ...floorInspection.value, article: "actress", article_id: actressId, hits: "20", sort: "date" };
  let itemResult = await fetchDmmJson("ItemList", itemParameters);
  let items = Array.isArray(itemResult.payload?.result?.items) ? itemResult.payload.result.items : [];
  let itemKeywordFallback = keywordFallback;
  if (!items.length && !keywordFallback) {
    itemKeywordFallback = true;
    itemResult = await fetchDmmJson("ItemList", { ...auth, ...floorInspection.value, keyword: targetActress, hits: "20", sort: "date" });
    items = Array.isArray(itemResult.payload?.result?.items) ? itemResult.payload.result.items : [];
  }
  if (!items.length && itemKeywordFallback && floorInspection.value.service === "digital") {
    const monoInspection = inspectFanzaMonoDvdFloor(floorResult.payload);
    if (monoInspection.value) {
      itemResult = await fetchDmmJson("ItemList", { ...auth, ...monoInspection.value, keyword: targetActress, hits: "20", sort: "date" });
      items = Array.isArray(itemResult.payload?.result?.items) ? itemResult.payload.result.items : [];
    }
  }
  const validation = [];
  const works = items.map((item, index) => {
    const imageLarge = selectAllowedDmmUrl([item?.imageURL?.large]);
    const imageList = selectAllowedDmmUrl([item?.imageURL?.list]);
    const imageSmall = selectAllowedDmmUrl([item?.imageURL?.small]);
    const image = imageLarge.allowedAfterNormalization ? imageLarge : imageList.allowedAfterNormalization ? imageList : imageSmall;
    const affiliateUrl = selectAllowedDmmUrl([
      item?.affiliateURL,
      item?.affiliateURLsp
    ]);
    const rejectionReasons = [];
    const actressNames = Array.isArray(item?.iteminfo?.actress)
      ? item.iteminfo.actress.map(candidate => String(candidate?.name || "")).filter(Boolean)
      : [];
    const titleMatches = normalizeName(item?.title).toLowerCase().includes(normalizeName(targetActress).toLowerCase());
    const actressMatches = actressNames.some(name => normalizeName(name).toLowerCase().includes(normalizeName(targetActress).toLowerCase()));
    if (itemKeywordFallback && !itemMatchesActress(item, targetActress)) rejectionReasons.push("本人一致なし");
    if (!item?.title) rejectionReasons.push("missing_title");
    if (!image.hasUrl) rejectionReasons.push("missing_image");
    else if (!image.allowedAfterNormalization) rejectionReasons.push("image_url_not_allowed");
    if (!affiliateUrl.hasUrl) rejectionReasons.push("missing_affiliate_url");
    else if (!affiliateUrl.allowedAfterNormalization) rejectionReasons.push("affiliate_url_not_allowed");
    validation.push({
      hasTitle: Boolean(item?.title),
      hasImage: image.hasUrl,
      imageProtocol: image.protocol,
      imageHost: image.host,
      imageAllowedBeforeNormalization: image.allowedBeforeNormalization,
      imageAllowedAfterNormalization: image.allowedAfterNormalization,
      imageLargeAllowedAfterNormalization: imageLarge.allowedAfterNormalization,
      imageListAllowedAfterNormalization: imageList.allowedAfterNormalization,
      imageSmallAllowedAfterNormalization: imageSmall.allowedAfterNormalization,
      hasAffiliateUrl: affiliateUrl.hasUrl,
      affiliateProtocol: affiliateUrl.protocol,
      affiliateHost: affiliateUrl.host,
      affiliateAllowedBeforeNormalization: affiliateUrl.allowedBeforeNormalization,
      affiliateAllowedAfterNormalization: affiliateUrl.allowedAfterNormalization,
      hasReleaseDate: Boolean(item?.date),
      rejectionReasons
    });
    if (rejectionReasons.length) return null;
    return {
      _score: scoreWorkTitle(String(item.title), targetActress),
      _index: index,
      title: String(item.title),
      releaseDate: item.date ? String(item.date) : "",
      maker: item?.iteminfo?.maker?.[0]?.name ? String(item.iteminfo.maker[0].name) : "",
      image: image.normalizedUrl,
      images: {
        large: imageLarge.normalizedUrl,
        list: imageList.normalizedUrl,
        small: imageSmall.normalizedUrl
      },
      affiliateUrl: affiliateUrl.normalizedUrl
    };
  }).filter(Boolean).sort((a, b) => b._score - a._score || a._index - b._index).slice(0, 3).map(({ _score, _index, ...work }) => work);
  if (itemResult.requestFailed) return finish([], "ItemList", "request_failed");
  if (!itemResult.payload) return finish([], "ItemList", "invalid_json_response");
  if (itemResult.httpStatus < 200 || itemResult.httpStatus >= 300) return finish([], "ItemList", "http_error");
  if (items.length === 0) return finish([], "ItemList", "zero_items");
  if (works.length === 0) return finish([], "ItemList", "all_items_rejected_by_validation");
  return finish(works, "complete", "success");
};
