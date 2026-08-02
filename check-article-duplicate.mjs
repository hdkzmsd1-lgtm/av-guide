import { access, readFile } from "node:fs/promises";

const registry = JSON.parse(await readFile(new URL("./article-registry.json", import.meta.url), "utf8"));
const normalize = value => value.normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s・･_\-‐‑‒–—―()（）【】「」『』🎀]/gu, "");
const fields = article => [article.name, article.reading, ...article.aliases, ...article.storeNames];
const queries = process.argv.slice(2).filter(Boolean);

if (queries.length) {
  const matches = registry.filter(article => {
    const values = fields(article).map(normalize);
    return queries.some(query => values.includes(normalize(query)));
  });
  if (matches.length) {
    console.error("既存記事が見つかりました。新規作成せず、次の記事を更新してください。");
    for (const article of matches) console.error(`- ${article.name}（${article.reading}）: ${article.file}`);
    process.exitCode = 2;
  } else {
    console.log("登録済みの記事に一致する名前・読み・店舗掲載名・別名はありません。");
  }
} else {
  const seen = new Map();
  const duplicates = [];
  const problems = [];
  for (const article of registry) {
    for (const value of fields(article)) {
      const key = normalize(value);
      if (!key) continue;
      const previous = seen.get(key);
      if (previous && previous.file !== article.file) duplicates.push([value, previous.file, article.file]);
      else seen.set(key, article);
    }
  }
  for (const article of registry) {
    try { await access(new URL(`./${article.file}`, import.meta.url)); }
    catch { problems.push(`記事ファイルがありません: ${article.file}`); }
  }
  const listHtml = await readFile(new URL("./actresses.html", import.meta.url), "utf8");
  const listFiles = [...listHtml.matchAll(/<a class="text-article-card" href="([^"]+\.html)"/g)].map(match => match[1]);
  for (const file of new Set(listFiles)) {
    const count = listFiles.filter(item => item === file).length;
    if (count > 1) problems.push(`記事一覧に同じ女優が${count}件あります: ${file}`);
  }
  for (const article of registry) {
    if (!listFiles.includes(article.file)) problems.push(`記事一覧に未掲載です: ${article.file}`);
  }
  if (new Set(listFiles).size !== registry.length) problems.push(`台帳${registry.length}件と記事一覧${new Set(listFiles).size}件が一致しません`);

  if (duplicates.length || problems.length) {
    console.error("台帳内に重複候補があります。");
    for (const [value, first, second] of duplicates) console.error(`- ${value}: ${first} / ${second}`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`台帳・記事一覧 ${registry.length}件：重複候補、未登録、欠落はありません。`);
  }
}
