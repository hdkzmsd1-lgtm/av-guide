"use strict";

(async function loadRelatedWorks() {
  const section = document.querySelector("#dmmRelatedWorks");
  const list = document.querySelector("#dmmRelatedWorksList");
  const topSections = [...document.querySelectorAll(".dmm-top-product")];
  if ((!section || !list) && !topSections.length) return;

  const isHomepage = !section && topSections.length > 0;
  const cache = new Map();
  const homepageQueue = [];
  let homepageActiveLoads = 0;
  const imageSources = {
    homepage: ["large", "list", "small"],
    related: ["large", "list", "small"],
    top: ["large", "list", "small"]
  };
  const buildImage = (work, actressName, kind, altText) => {
    const source = work?.images || {};
    const src = imageSources[kind].map(key => source[key]).find(Boolean) || work?.image || "";
    if (!src) return null;
    const shell = document.createElement("span");
    shell.className = `dmm-media-shell dmm-media-${kind} is-loading`;
    const image = document.createElement("img");
    image.className = `dmm-media-image${kind === "homepage" ? " dmm-representative-image" : ""}`;
    image.src = src;
    image.alt = altText || `${actressName} 関連作品（PR）`;
    image.loading = "lazy";
    image.decoding = "async";
    const settle = state => {
      shell.classList.remove("is-loading");
      shell.classList.add("is-loaded");
      if (state === "error") shell.classList.add("is-error");
    };
    if (image.complete) {
      settle();
    } else {
      image.addEventListener("load", () => settle(), { once: true });
      image.addEventListener("error", () => settle("error"), { once: true });
    }
    shell.append(image);
    return shell;
  };
  const fetchWorks = async actressName => {
    if (!actressName) return null;
    if (cache.has(actressName)) return cache.get(actressName);
    const request = fetch(`/.netlify/functions/dmm-related-works?actress=${encodeURIComponent(actressName)}`, {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    }).then(async response => response.ok ? response.json() : null).catch(() => null);
    cache.set(actressName, request);
    return request;
  };
  const loadHomepageCard = async card => {
    if (!card || ["loading", "loaded", "failed"].includes(card.dataset.dmmImageStatus)) return;
    if (card.querySelector(".dmm-representative-image")) {
      card.dataset.dmmImageStatus = "loaded";
      return;
    }
    card.dataset.dmmImageStatus = "loading";
    const actressName = card.dataset.actress || card.querySelector("h3")?.textContent.trim();
    const payload = await fetchWorks(actressName);
    const work = Array.isArray(payload?.works) ? payload.works[0] : null;
    if (!work?.title || card.querySelector(".dmm-representative-image")) {
      card.dataset.dmmImageStatus = "failed";
      return;
    }
    const media = buildImage(work, actressName, "homepage", `${actressName} 関連作品（PR）`);
    if (!media) {
      card.dataset.dmmImageStatus = "failed";
      return;
    }
    const label = document.createElement("span");
    label.className = "dmm-representative-label";
    label.textContent = "PR";
    card.prepend(label, media);
    card.dataset.dmmImageStatus = "loaded";
  };
  const pumpHomepageQueue = () => {
    while (homepageActiveLoads < 2 && homepageQueue.length) {
      const card = homepageQueue.shift();
      homepageActiveLoads += 1;
      loadHomepageCard(card).catch(() => {
        card.dataset.dmmImageStatus = "failed";
      }).finally(() => {
        homepageActiveLoads -= 1;
        pumpHomepageQueue();
      });
    }
  };
  const queueHomepageCards = cards => {
    cards.filter(card => card && !card.hidden).forEach(card => {
      if (card.dataset.dmmImageStatus && card.dataset.dmmImageStatus !== "idle") return;
      if (card.querySelector(".dmm-representative-image") || homepageQueue.includes(card)) return;
      card.dataset.dmmImageStatus = "queued";
      homepageQueue.push(card);
    });
    pumpHomepageQueue();
  };

  try {
    // トップページでは代表画像をカードの表示領域に入った時だけ取得します。
    if (isHomepage) {
      const cards = [...document.querySelectorAll("#latest .article-list .text-article-card")];
      const loadVisibleCards = visibleCards => queueHomepageCards(visibleCards);
      loadVisibleCards(cards);
      window.addEventListener("avguide:cards-visible", event => {
        const visibleCards = Array.isArray(event.detail?.cards) ? event.detail.cards : cards;
        loadVisibleCards(visibleCards);
      });
      const topSectionTask = Promise.allSettled(topSections.map(async topSection => {
        // 既存のトップ用おすすめ作品セクションは従来どおり維持します。
        const topList = topSection.querySelector(".dmm-work-list");
        const topActress = topSection.dataset.actress;
        if (!topList || !topActress) return;
        const topPayload = await fetchWorks(topActress);
        const work = Array.isArray(topPayload?.works) ? topPayload.works[0] : null;
        if (!work?.title || !work?.affiliateUrl) return;
        const card = document.createElement("article");
        card.className = "dmm-work-card";
        const media = buildImage(work, topActress, "top", work.title);
        if (!media) return;
        const details = document.createElement("div");
        const title = document.createElement("h3"); title.textContent = work.title;
        const link = document.createElement("a"); link.className = "button dmm-work-button"; link.href = work.affiliateUrl; link.target = "_blank"; link.rel = "sponsored noopener noreferrer"; link.textContent = "FANZAで作品を見る";
        details.append(title, link); card.append(media, details); topList.replaceChildren(card);
        const articleUrl = topSection.dataset.articleUrl;
        if (articleUrl) card.addEventListener("click", event => { if (!event.target.closest("a")) window.location.href = articleUrl; });
        topSection.hidden = false;
      }));
      topSectionTask.catch(() => {});
    }

    const actress = section?.dataset.actress || topSections[0]?.dataset.actress;
    const payload = await fetchWorks(actress);
    if (!payload) return;
    if (payload?.actress && payload.actress !== actress) return;
    if (!Array.isArray(payload?.works) || payload.works.length === 0) {
      if (!topSections.length) return;
    }

    const createCards = (works, includeDate, includeMaker) => {
      const fragment = document.createDocumentFragment();
      works.forEach(work => {
      if (!work?.title || !work?.affiliateUrl) return;

      const card = document.createElement("article");
      card.className = "dmm-work-card";

      const media = buildImage(work, actress, "related", work.title);
      if (!media) return;

      const details = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = work.title;
      details.append(title);

      if (includeDate && work.releaseDate) {
        const date = document.createElement("p");
        date.textContent = `発売日：${work.releaseDate}`;
        details.append(date);
      }

      if (includeMaker && work.maker) {
        const maker = document.createElement("p");
        maker.textContent = `メーカー：${work.maker}`;
        details.append(maker);
      }

      const link = document.createElement("a");
      link.className = "button dmm-work-button";
      link.href = work.affiliateUrl;
      link.target = "_blank";
      link.rel = "sponsored noopener noreferrer";
      link.textContent = "FANZAで作品を見る";
      details.append(link);

      card.append(media, details);
      fragment.append(card);
      });
      return fragment;
    };

    if (section && list) {
      const fragment = createCards(payload.works.slice(0, 3), true, true);
      if (fragment.childNodes.length) {
        list.replaceChildren(fragment);
        section.hidden = false;
      }
    }
    for (const topSection of topSections) {
      const topList = topSection.querySelector(".dmm-work-list");
      if (!topList) continue;
      let topPayload = payload;
      if (topSection.dataset.actress && topSection.dataset.actress !== actress) {
        topPayload = await fetchWorks(topSection.dataset.actress);
      }
      const fragment = createCards(Array.isArray(topPayload?.works) ? topPayload.works.slice(0, 1) : [], false, false);
      if (fragment.childNodes.length) {
        topList.replaceChildren(fragment);
        const articleUrl = topSection.dataset.articleUrl;
        if (articleUrl) {
          topList.querySelectorAll(".dmm-work-card").forEach(card => {
            card.tabIndex = 0;
            card.setAttribute("role", "link");
            const openArticle = event => {
              if (event.target.closest("a")) return;
              window.location.href = articleUrl;
            };
            card.addEventListener("click", openArticle);
            card.addEventListener("keydown", event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openArticle(event);
              }
            });
          });
        }
        topSection.hidden = false;
      }
    }
  } catch {
    // APIエラー時は関連作品欄を非表示のままにします。
  }
})();
