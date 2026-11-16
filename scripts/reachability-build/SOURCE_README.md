# 到達圏の計算に使った道路網

このアーカイブは愛媛県観光マップに表示する到達圏の計算に実際に使用した道路網の複製です。

- `valhalla_tiles.tar`: OpenStreetMapの道路データからValhallaで構築したグラフ。
- `admins.sqlite`: 道路の行政区情報。`default_speeds.json`: 使用した道路速度設定。
- `valhalla.json`: 渡船のハード除外を有効にした実際の計算設定。
- `manifest.json`: グラフ構築時のキャッシュの記録。入力PBFのURL・日時・SHA-256、領域、当時の各ファイルのSHA-256、Valhallaイメージを記録しています。`file_hashes.txt` と `.file_hashes.txt` はキャッシュ内部用のため、このアーカイブには含めていません。
- `source-meta.json`: 表示データの出典と計算条件、同梱ファイルのSHA-256。特に `runtime_config_sha256` は、構築後に渡船の除外を設定した同梱 `valhalla.json` のハッシュです。構築時の設定を記録した `manifest.json` の `valhalla.json` ハッシュとは異なります。生成コードは `scripts/` に同梱。
- `scripts/requirements.txt`: 幾何処理に使用するNumPy 2.3.1とShapely 2.1.2の固定依存関係。

道路データ © OpenStreetMap contributors、Open Database License (ODbL) 1.0。<https://www.openstreetmap.org/copyright> および <https://opendatacommons.org/licenses/odbl/1-0/> を参照してください。速度設定のライセンスは `LICENSE-OSMSpeeds.txt`、Valhallaのライセンスは `LICENSE-Valhalla.txt` です。

Valhallaのコンテナイメージは `source-meta.json` のdigestで固定しています。空の作業ディレクトリにこのアーカイブのグラフと設定を置き、`ghcr.io/valhalla/valhalla-scripted` の固定イメージで `/custom_files` にマウントし、`use_tiles_ignore_pbf=True` で起動できます。提供する `scripts/canary.py` と `scripts/generate.py` は検証と地点ごとの再計算に使えます。生成方法と注意事項は `scripts/README.md` を参照してください。

表示用の輪郭は短時間から順に累積unionし、長時間側が短時間側を含むよう処理しています。Shapely/GEOSを使用し、座標の格子は1e-7度、前の輪郭を広げるバッファは2e-7度です。4時間帯での精度調整による移動は愛媛付近で対角約0.12m以下で、unionによって短時間側の範囲を追加する変化は別です。実際のNumPy・Shapely・GEOSバージョンは `source-meta.json` に記録しています。

経路は推定値です。実際の入口、渋滞、通行止め、天候は反映されず、時刻や条件を保証しません。
