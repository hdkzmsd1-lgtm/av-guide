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

function diagnosticResponse(diagnostic) {
  return jsonResponse({ debug: diagnostic }, "no-store");
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

function sanitizeMessage(value, secrets) {
  if (value === undefined || value === null) return null;
  let message = String(value).slice(0, 500);
  secrets.filter(Boolean).forEach(secret => {
    [secret, encodeURIComponent(secret)].forEach(candidate => {
      message = message.split(candidate).join("[redacted]");
    });
  });
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b(api_id|affiliate_id)=[^\s&]+/gi, "$1=[redacted]");
}

function resultMeta(payload, secrets) {
  return {
    status: payload?.result?.status ?? null,
    message: sanitizeMessage(payload?.result?.message, secrets),
    errors: sanitizeErrors(payload?.result?.errors, secrets)
  };
}

function sanitizeErrors(value, secrets) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, message]) => [
    String(key).slice(0, 100),
    sanitizeMessage(message, secrets)
  ]));
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

function initialDiagnostic(apiId, affiliateId, targetActress) {
  return {
    environment: {
      DMM_API_ID: Boolean(apiId),
      DMM_AFFILIATE_ID: Boolean(affiliateId)
    },
    ActressSearch: {
      httpStatus: null,
      resultStatus: null,
      resultMessage: null,
      resultErrors: null,
      retrievedCount: 0,
      exactMatchCount: 0,
      adoptedActressId: null,
      parameters: {
        endpoint: "ActressSearch",
        version: "v3",
        keyword: targetActress,
        hits: 100,
        output: "json",
        site: null,
        service: null
      }
    },
    FloorList: {
      httpStatus: null,
      resultStatus: null,
      resultMessage: null,
      resultErrors: null,
      found: { site: false, service: false, floor: false }
    },
    ItemList: {
      httpStatus: null,
      resultStatus: null,
      resultMessage: null,
      resultErrors: null,
      retrievedCount: 0,
      adoptedCount: 0,
      validation: [],
      parameters: {
        article: "actress",
        article_id: null,
        site: null,
        service: null,
        floor: null,
        sort: "date",
        hits: 20
      }
    },
    stage: "environment",
    reason: "not_started"
  };
}

exports.handler = async function handler(event) {
  if (event?.httpMethod && event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { Allow: "GET" }, body: "" };
  }

  const debug = event?.queryStringParameters?.debug === "1";
  const requestedActress = event?.queryStringParameters?.actress;
  const targetActress = requestedActress?.trim() || "";
  const apiId = process.env.DMM_API_ID || "";
  const affiliateId = process.env.DMM_AFFILIATE_ID || "";
  const diagnostic = initialDiagnostic(apiId, affiliateId, targetActress);
  const finish = (works, stage, reason) => {
    if (!debug) return works.length ? jsonResponse({ works, actress: targetActress }, "public, max-age=300, s-maxage=3600") : emptyResponse();
    diagnostic.stage = stage;
    diagnostic.reason = reason;
    return diagnosticResponse(diagnostic);
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
  const secrets = [apiId, affiliateId];

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
  const actressMeta = resultMeta(actressResult.payload, secrets);
  Object.assign(diagnostic.ActressSearch, {
    httpStatus: actressResult.httpStatus,
    resultStatus: actressMeta.status,
    resultMessage: actressMeta.message,
    resultErrors: actressMeta.errors,
    retrievedCount: actressCandidates.length,
    exactMatchCount: exactIds.length,
    adoptedActressId: exactIds.length === 1 ? exactIds[0] : null
  });
  if (actressResult.requestFailed) return finish([], "ActressSearch", "request_failed");
  if (!actressResult.payload) return finish([], "ActressSearch", "invalid_json_response");
  if (actressResult.httpStatus < 200 || actressResult.httpStatus >= 300) return finish([], "ActressSearch", "http_error");
  const keywordFallback = exactIds.length === 0;
  if (exactIds.length > 1) return finish([], "ActressSearch", "ambiguous_exact_match");
  const actressId = exactIds[0];

  const floorResult = await fetchDmmJson("FloorList", auth);
  const floorMeta = resultMeta(floorResult.payload, secrets);
  const floorInspection = inspectFanzaVideoFloor(floorResult.payload);
  Object.assign(diagnostic.FloorList, {
    httpStatus: floorResult.httpStatus,
    resultStatus: floorMeta.status,
    resultMessage: floorMeta.message,
    resultErrors: floorMeta.errors,
    found: floorInspection.found
  });
  if (floorResult.requestFailed) return finish([], "FloorList", "request_failed");
  if (!floorResult.payload) return finish([], "FloorList", "invalid_json_response");
  if (floorResult.httpStatus < 200 || floorResult.httpStatus >= 300) return finish([], "FloorList", "http_error");
  if (!floorInspection.value) return finish([], "FloorList", "fanza_video_floor_not_found");

  const itemParameters = keywordFallback
    ? { ...auth, ...floorInspection.value, keyword: targetActress, hits: "20", sort: "date" }
    : { ...auth, ...floorInspection.value, article: "actress", article_id: actressId, hits: "20", sort: "date" };
  Object.assign(diagnostic.ItemList.parameters, keywordFallback
    ? { keyword: targetActress, ...floorInspection.value }
    : { article_id: actressId, ...floorInspection.value });
  let itemResult = await fetchDmmJson("ItemList", itemParameters);
  let itemMeta = resultMeta(itemResult.payload, secrets);
  let items = Array.isArray(itemResult.payload?.result?.items) ? itemResult.payload.result.items : [];
  let itemKeywordFallback = keywordFallback;
  if (!items.length && !keywordFallback) {
    itemKeywordFallback = true;
    itemResult = await fetchDmmJson("ItemList", { ...auth, ...floorInspection.value, keyword: targetActress, hits: "20", sort: "date" });
    items = Array.isArray(itemResult.payload?.result?.items) ? itemResult.payload.result.items : [];
    itemMeta = resultMeta(itemResult.payload, secrets);
    Object.assign(diagnostic.ItemList.parameters, { keyword: targetActress });
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
  Object.assign(diagnostic.ItemList, {
    httpStatus: itemResult.httpStatus,
    resultStatus: itemMeta.status,
    resultMessage: itemMeta.message,
    resultErrors: itemMeta.errors,
    retrievedCount: items.length,
    adoptedCount: works.length,
    validation
  });
  if (itemResult.requestFailed) return finish([], "ItemList", "request_failed");
  if (!itemResult.payload) return finish([], "ItemList", "invalid_json_response");
  if (itemResult.httpStatus < 200 || itemResult.httpStatus >= 300) return finish([], "ItemList", "http_error");
  if (items.length === 0) return finish([], "ItemList", "zero_items");
  if (works.length === 0) return finish([], "ItemList", "all_items_rejected_by_validation");
  return finish(works, "complete", "success");
};
