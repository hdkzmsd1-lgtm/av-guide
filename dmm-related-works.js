"use strict";

(async function loadRelatedWorks() {
  const section = document.querySelector("#dmmRelatedWorks");
  const list = document.querySelector("#dmmRelatedWorksList");
  if (!section || !list) return;

  try {
    const response = await fetch("/.netlify/functions/dmm-related-works", {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    });
    if (!response.ok) return;

    const payload = await response.json();
    if (!Array.isArray(payload?.works) || payload.works.length === 0) return;

    const fragment = document.createDocumentFragment();
    payload.works.slice(0, 3).forEach(work => {
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

      if (work.releaseDate) {
        const date = document.createElement("p");
        date.textContent = `発売日：${work.releaseDate}`;
        details.append(date);
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

    if (!fragment.childNodes.length) return;
    list.replaceChildren(fragment);
    section.hidden = false;
  } catch {
    // APIエラー時は関連作品欄を非表示のままにします。
  }
})();
