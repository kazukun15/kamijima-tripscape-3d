# 到達圏の計算に使った道路網

このアーカイブは愛媛県観光マップに表示する到達圏の計算に実際に使用した道路網の複製です。

- `valhalla_tiles.tar`: OpenStreetMapの道路データからValhallaで構築したグラフ。
- `admins.sqlite`: 道路の行政区情報。`default_speeds.json`: 使用した道路速度設定。
- `valhalla.json`: 渡船のハード除外を有効にした実際の計算設定。
- `manifest.json`: グラフ構築時の入力PBFのURL・日時・SHA-256、領域、各ファイルのSHA-256、Valhallaイメージ。
- `source-meta.json`: 表示データの出典と計算条件。生成コードは `scripts/` に同梱。

道路データ © OpenStreetMap contributors、Open Database License (ODbL) 1.0。<https://www.openstreetmap.org/copyright> および <https://opendatacommons.org/licenses/odbl/1-0/> を参照してください。速度設定のライセンスは `LICENSE-OSMSpeeds.txt`、Valhallaのライセンスは `LICENSE-Valhalla.txt` です。

Valhallaのコンテナイメージは `source-meta.json` のdigestで固定しています。空の作業ディレクトリにこのアーカイブのグラフと設定を置き、`ghcr.io/valhalla/valhalla-scripted` の固定イメージで `/custom_files` にマウントし、`use_tiles_ignore_pbf=True` で起動できます。提供する `scripts/canary.py` と `scripts/generate.py` は検証と地点ごとの再計算に使えます。生成方法と注意事項は `scripts/README.md` を参照してください。

経路は推定値です。実際の入口、渋滞、通行止め、天候は反映されず、時刻や条件を保証しません。
