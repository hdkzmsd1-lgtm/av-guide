# AV Guide

AV Guideは、AV女優の在籍店舗情報を公式情報をもとに整理する静的サイトです。

## 公開HTMLの配置

- 既存の公開URLを維持するため、記事HTMLはルート直下に置きます。
- 記事HTMLや公開HTMLを、整理目的だけで`/articles/`などへ移動しないでください。
- 記事の登録状況は`article-registry.json`を台帳として管理します。

## 新規記事の追加

新規記事を追加するときは、既存記事との重複を確認し、`article-template.html`を現在のテンプレートとして使用します。記事作成と合わせて、次のファイルを更新します。

- `index.html`
- `actresses.html`
- `article-registry.json`
- `sitemap.xml`

記事ページには、次の構造を含めます。

- AV女優名を設定した`data-actress`
- 関連作品欄の`#dmmRelatedWorks`
- `dmm-related-works.js`の読み込み
- 上部・下部のDMM公式バナー
- 訂正・削除依頼ページへのリンク

## DMM Webサービスと画像の扱い

- DMM APIキーなどのAPI認証情報は、`netlify/functions/dmm-related-works.js`を含むNetlify Function側だけで扱い、HTMLやブラウザJavaScript、レスポンス、ログへ露出させません。
- DMM/FANZAの画像は公式APIが返すURLを利用し、ダウンロード、ローカル保存、加工をしません。
- 店舗公式サイトの画像、紹介文、プロフィール文、キャッチコピーは転載しません。

## 将来の記事ディレクトリ移行

記事HTMLを将来的に`/articles/`へ移す場合は、単純なファイル移動ではなくサイト移行として扱います。旧URLから新URLへの301リダイレクトを設定し、各記事のcanonical、OGP URL、`sitemap.xml`、内部リンク、レジストリ、CSS・JavaScriptなどの参照パスを更新して、404やリダイレクトループがないことを確認してください。
