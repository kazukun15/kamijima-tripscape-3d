# KAMIJIMA TRIPSCAPE 3D

上島町の主要8島を、実地形・出典付きの観光地点・場所の物語から探索する静的WEBGISです。添付パックの原本は `requirements/` に保存しています。

共有用サイト: **https://kazukun15.github.io/kamijima-tripscape-3d/**

ソース: https://github.com/kazukun15/kamijima-tripscape-3d

現在の調査データは2026-10-05時点。公式一覧148ページと景勝地等3件を照合し、**18件を公開、133件を調査待ち**として分離しました。入口未確認の山・島・景勝地は、その代表地点であることを詳細に明示しています。未確認の施設を推測位置で地図に載せていません。

| 島 | 公開地点 |
| --- | ---: |
| 弓削島 | 8 |
| 佐島 | 1 |
| 生名島 | 2 |
| 岩城島 | 3 |
| 魚島 | 1 |
| 高井神島 | 1 |
| 豊島 | 1 |
| 津波島 | 1 |

## 起動

Node.js 22.12以上または24を使います。一般的なnpm環境では次のコマンドで起動できます。

```powershell
npm ci
npm run dev
```

`http://127.0.0.1:4173/` を開きます。この作業環境にはnpmコマンドがなかったため、ZIP展開した公式npmを `work/npm/package/bin/npm-cli.js` に配置しました。作業環境内では `npm` の代わりに `node work\npm\package\bin\npm-cli.js` を使えます。`work/` は配布物には不要です。

```powershell
npm run validate:data
npm test
npm run build
npm run serve:dist
```

`dist/` が完成済みの静的配布物です。file://で直接開かず、HTTPで配信してください。ルートだけでなくサブディレクトリにも相対アセットで配置できます。`serve:dist` は実ファイルのHTTPステータスと404ページも検証できるローカル確認サーバーです。

## 操作

- 島名・カテゴリ・キーワードで検索します。「塩」「桜」「レモン」、かなや関連人物名も検索対象です。「漫画」は公式紹介に基づく高井神島のカードへ案内します。壁画の位置未確認ピンは作りません。
- 地図の印や左の一覧を選ぶと詳細が開きます。「深掘り」で資料に基づく説明、関連人物、テーマ、次の場所をたどれます。
- 季節、移動手段、閲覧履歴、時刻、距離、共通テーマから次の場所を提示します。推薦理由も表示します。
- 3D/2D、陰影、淡色地図/航空写真を切り替えられます。Ctrl＋ドラッグで回転・傾斜、右下の視点スライダーで0〜80度。地形の標高強調は1.0です。
- スマートフォンでは検索パネルと詳細のボトムシートを使います。ハンドルで小さくし、「深掘り」で大きくできます。
- 共有ボタンは現在の選択地点・島・検索・カテゴリ・テーマ・季節・移動手段・表示モードをURLに保存します。しおりはブラウザー内のみ。現在地はボタン操作時だけ取得し、保存しません。
- 港/現在地から徒歩・自転車の外部地図を開けます。船の航路・時刻は町の最新公式アクセス案内へ進みます。船を含むルートをアプリ内で計算する機能はありません。

## 地形とフォールバック

国土地理院のDEM PNGを公式符号付きRGB規則でデコードし、Mapbox Terrain RGBへ変換済みです。z8〜14の366タイル（元DEM取得成功170、海域等の404は196）と淡色地図366タイルを同梱。海域などの無効値は表示用0m平面で、測定標高ではありません。変換検証の記録は `research/terrain-verification.json`。

WebGLが使えない場合はLeafletの2D地図に切り替えます。DEMが読めない場合はMapLibreで地形を無効にし、検索と地点表示を継続します。`?renderer=2d` で2Dフォールバックを直接確認できます。航空写真を選ぶと地理院の外部タイルを取得します。淡色地図・地形・公開地点は同梱データから読み込みます。

明示的な高さを確認できた建物データは0件です。建物レイヤーは空で、仮の高さを入れていません。今後のデータ追加は形状と高さの出典照合後に行います。建物表示を含む要件は未充足です。

## テスト

```powershell
npx playwright install chromium
npm run test:e2e
```

ChromiumのデスクトップとPixel 7画面を使い、本番ビルドに対して検証します。ソフトウェアWebGLを有効にしてCIでも地形を描画します。Windowsでブラウザーの保存先を指定する場合は、インストールとテストの両方に同じ `PLAYWRIGHT_BROWSERS_PATH` を設定してください。結果と実行範囲は `outputs/QA_REPORT.md`、スクリーンショットは `outputs/qa/`。

## 公開・更新

Cloudflare Pages: ビルドコマンド `npm run build`、出力フォルダー `dist`、Node.js 22以上。APIキー・環境秘密情報は不要です。

GitHub Pages: `.github/workflows/pages.yml` が `main` へのpushでデータ検証・単体テスト・ビルド後にPagesへ配布します。Actions画面から手動実行もできます。Pagesの配信パスをビルドと404の戻り先に反映します。GitHub標準のHTTPS URLを使い、独自ドメインは設定していません。

情報更新時は `scripts/build-data.mjs` の確認済みレコードと元調査データを修正し、`node scripts/build-data.mjs`、`npm run validate:data`、テスト、ビルドを再実行します。調査スクリプトはネットワークを使います。再取得で人手の照合を省略しないでください。DEM再生成にはPython・Pillow・NumPy、ベクトル調査には `@mapbox/vector-tile` と `pbf` を使用します。

配布ZIPには生成済み観光データ・地形・背景地図・公開用distとソースを同梱しています。元のHTML/PDF、公式ページ全文の抽出ファイル、実行キャッシュは同梱しません。通常のインストール・ビルドでは原典を再取得する必要はありません。観光データを原典から再生成する場合は、調査スクリプトで資料を再取得してから照合してください。

## データ・調査の場所

| ファイル | 内容 |
| --- | --- |
| `data/poi/verified.json` | 公開18件。本文と位置それぞれの出典、確認日、範囲、注意、関連記事 |
| `data/islands.json` | 主要8島。国土地理院の島名注記と公式ガイド |
| `data/topics.json` | 15テーマの関係と出典 |
| `public/data/pois.geojson` | 公開地点だけのGeoJSON |
| `research/pending.json` | 133件の未確認候補と理由。座標null |
| `research/RESEARCH_REPORT.md` | 出典、座標採用条件、取れなかったデータ、追加調査 |
| `research/fetch-log.json` | 元ページ取得の記録 |
| `research/terrain-verification.json` | 標高変換と取得状況 |

信頼度の数値は照合手順を示す内部評価であり、統計的な正確性の確率ではありません。営業時間・料金は未確認の値を埋めずnullとしました。船の運航、営業、公開日は外部公式情報で再確認してください。これは町の公式サービスではありません。

## 出典・権利

町公式観光ガイド: https://kamijima.info/ ／ 愛媛県公式観光: https://www.iyokannet.jp/ ／ 地理院タイル: https://maps.gsi.go.jp/development/ichiran.html

本文は出典を基に要約・整理したものです。公式サイトの写真は転載していません。地理院タイルの帰属を地図に常時表示し、加工したDEM・背景地図であることを明記しています。地理院コンテンツ利用条件: https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html 。利用したOSSの通知は `THIRD_PARTY_NOTICES.md`。
