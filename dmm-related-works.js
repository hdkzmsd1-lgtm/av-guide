"use strict";

(async function loadRelatedWorks() {
  const section = document.querySelector("#dmmRelatedWorks");
  const list = document.querySelector("#dmmRelatedWorksList");
  const topSections = [...document.querySelectorAll(".dmm-top-product")];
  if ((!section || !list) && !topSections.length) return;

  try {
    const actress = section?.dataset.actress || topSections[0]?.dataset.actress;
    const endpoint = actress
      ? `/.netlify/functions/dmm-related-works?actress=${encodeURIComponent(actress)}`
      : "/.netlify/functions/dmm-related-works";
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    });
    if (!response.ok) return;

    const payload = await response.json();
    if (!Array.isArray(payload?.works) || payload.works.length === 0) return;

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
        const topResponse = await fetch(`/.netlify/functions/dmm-related-works?actress=${encodeURIComponent(topSection.dataset.actress)}`, {
          headers: { Accept: "application/json" },
          credentials: "same-origin"
        });
        if (topResponse.ok) topPayload = await topResponse.json();
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
