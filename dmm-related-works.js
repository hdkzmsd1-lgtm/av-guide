"use strict";

(async function loadRelatedWorks() {
  const section = document.querySelector("#dmmRelatedWorks");
  const list = document.querySelector("#dmmRelatedWorksList");
  const topSections = [...document.querySelectorAll(".dmm-top-product")];
  if ((!section || !list) && !topSections.length) return;

  const isHomepage = !section && topSections.length > 0;
  const cache = new Map();
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

  try {
    // トップページでは代表画像をカードの表示領域に入った時だけ取得します。
    if (isHomepage) {
      const cards = [...document.querySelectorAll("#latest .article-list .text-article-card")];
      const loadCard = async card => {
        if (!card || card.dataset.dmmLoaded === "true") return;
        card.dataset.dmmLoaded = "true";
        const actressName = card.dataset.actress || card.querySelector("h3")?.textContent.trim();
        const payload = await fetchWorks(actressName);
        const work = Array.isArray(payload?.works) ? payload.works[0] : null;
        if (!work?.image || !work?.title || card.querySelector(".dmm-representative-image")) return;
        const image = document.createElement("img");
        image.className = "dmm-representative-image";
        image.src = work.image;
        image.alt = `${actressName} 関連作品（PR）`;
        image.loading = "lazy";
        image.decoding = "async";
        const label = document.createElement("span");
        label.className = "dmm-representative-label";
        label.textContent = "PR";
        card.prepend(label, image);
      };
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            loadCard(entry.target);
          });
        }, { rootMargin: "200px 0px" });
        cards.forEach((card, index) => index < 5 ? loadCard(card) : observer.observe(card));
      } else {
        cards.slice(0, 5).forEach(loadCard);
      }
      // 既存のトップ用おすすめ作品セクションは従来どおり維持します。
      for (const topSection of topSections) {
        const topList = topSection.querySelector(".dmm-work-list");
        const topActress = topSection.dataset.actress;
        if (!topList || !topActress) continue;
        const topPayload = await fetchWorks(topActress);
        const work = Array.isArray(topPayload?.works) ? topPayload.works[0] : null;
        if (!work?.image || !work?.title || !work?.affiliateUrl) continue;
        const card = document.createElement("article");
        card.className = "dmm-work-card";
        const image = document.createElement("img");
        image.src = work.image; image.alt = work.title; image.loading = "lazy"; image.decoding = "async";
        const details = document.createElement("div");
        const title = document.createElement("h3"); title.textContent = work.title;
        const link = document.createElement("a"); link.className = "button dmm-work-button"; link.href = work.affiliateUrl; link.target = "_blank"; link.rel = "sponsored noopener noreferrer"; link.textContent = "FANZAで作品を見る";
        details.append(title, link); card.append(image, details); topList.replaceChildren(card);
        const articleUrl = topSection.dataset.articleUrl;
        if (articleUrl) card.addEventListener("click", event => { if (!event.target.closest("a")) window.location.href = articleUrl; });
        topSection.hidden = false;
      }
      return;
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
      if (!work?.title || !work?.image || !work?.affiliateUrl) return;

      const card = document.createElement("article");
      card.className = "dmm-work-card";

      const image = document.createElement("img");
      image.src = work.image;
      image.alt = work.title;
      image.loading = "lazy";
      image.decoding = "async";

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

      card.append(image, details);
      fragment.append(card);
      });
      return fragment;
    };

    const representativeCards = [...document.querySelectorAll("#latest .article-list .text-article-card")];
    for (const card of representativeCards) {
      const actressName = card.dataset.actress || card.querySelector("h3")?.textContent.trim();
      if (!actressName || card.querySelector(".dmm-representative-image")) continue;
      const cardPayload = actressName === actress ? payload : await fetchWorks(actressName);
      const work = Array.isArray(cardPayload?.works) ? cardPayload.works[0] : null;
      if (!work?.image || !work?.title) continue;
      const image = document.createElement("img");
      image.className = "dmm-representative-image";
      image.src = work.image;
      image.alt = `${actressName} 関連作品（PR）`;
      image.loading = "lazy";
      image.decoding = "async";
      const label = document.createElement("span");
      label.className = "dmm-representative-label";
      label.textContent = "PR";
      card.prepend(label, image);
    }

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
