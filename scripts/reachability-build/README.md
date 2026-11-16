# 到達圏の事前生成プロトタイプ

**実コンテナ・日本の実データでの実行は未検証。** このディレクトリのスクリプトは候補データの生成と検証までで、自動公開・コミットは行いません。`.github/workflows/reachability-build.yml` で候補データを生成します。

## 手順

1. `python3 scripts/reachability-build/test_fixture.py` で合成レスポンスの検証を実行します。
2. 独立したLinuxランナーに `osmium-tool`、Docker、Python 3、curl、sudoを準備し、`bash scripts/reachability-build/run.sh` を実行します。既存の一時ファイルがある場合は上書きせず停止します。ローカルDockerは未使用です。
3. Geofabrik JapanのPBF（約2.4GB）を取得し、元PBFのSHA-256とレプリケーション時刻を記録します。`osmium extract --strategy smart --option types=multipolygon,boundary --bbox 131.4,32.4,134.6,35` で切り出し、境界relationの参照不足に備えます。smartでも日本の行政界全域が完全とは限らず、メモリ・ディスク増大のおそれがあります。
4. 公式 `ghcr.io/valhalla/valhalla-scripted:3.9.1` をdigest固定して一時起動し、ローカル `127.0.0.1:8002` でのみ公開します。OSMグラフと行政DBを生成し、設定を停止中に `service_limits.allow_hard_exclusions=true` とした後に再起動します。高度・時刻・公共交通・ライブ交通は読み込みません。
5. `verify-status.py` でバージョン・グラフ・行政DBを検証。`canary.py` は松山・上島・東予・南予で実ルートを作り、`trace_attributes` の全道路エッジが `drive_on_right=false` と確認します。さらに各モードで、実際に渡船を使う正例を確認し、`exclude_ferries` の負例が不通か渡船なしであることを要求します。徒歩の正例に限り、実際に観測した警告401を許容します。負例と到達圏の警告は許容しません。さらに3手段の到達圏そのものについて、航路ありでは対岸5点を含み、航路除外では含まないことを検査します。
6. 成功後、101地点×3手段を逐次計算します。1回の要求で10・20・30・60分の4輪郭をまとめます。全地点が3手段を持つ入力では303要求・最大1,212輪郭です。出発地点は `search_cutoff:100`、`minimum_reachability:1`、`search_filter.exclude_ferry:true`、コストは `exclude_ferries:true` とし、実際に返った全スナップ候補が100m以内でなければ `no_road` とします。
7. `generated/{ID}.json`、`build-summary.json`、`source-meta.json` を成果物にします。未知のエラー、警告、未閉鎖リング、欠けた時間帯、切出し境界15km以内の輪郭は失敗扱いで、候補を公開しません。境界検査は完全性を証明するものではありません。

## 判断が必要な点

- `use_ferry:0` は完全除外ではありません。`exclude_ferries` は実験的で、`allow_hard_exclusions` が無効なら警告して無視され、始点・終点エッジに例外があります。経路と等時間圏のサンプルcanaryは、全ネットワークの完全な証明ではありません。
- 補間した輪郭は、道路のない場所や海上を塗る場合があります。塗りの内部の全地点に実際に到達できることを意味しません。実際の渋滞・通行止め・渡船の運航時刻も反映しません。
- 100mは出発地点と道路候補の最大距離として採用した暫定基準で、入口・通行可能性・同じ島での接続を保証しません。候補がない場合は `no_road` にします。複数候補のうち1点でも100mを超えれば `no_road` です。
- PBFはOpenStreetMapのODbLデータです。地図上の到達圏にも `© OpenStreetMap contributors` と https://www.openstreetmap.org/copyright を表示し、公開する出力・元データ・生成方法に適用されるODbLの条件を確認してください。元のPBFのSHA-256とレプリケーション時刻を記録しても、元の日本全域PBFは日付付きのGeofabrik公開アーカイブを使用します。ValhallaはMITライセンスです。
- GitHub-hosted public Linux runnerは4 CPU・16GB RAM・14GB SSDの仕様ですが、この処理の所要時間、使用容量、メモリは未実測です。smart切出しと行政DBにより条件を超える可能性があります。失敗時のログを確認し、必要ならより大きな環境を用意してください。
- 静的ファイルは生成時点のデータに固定されます。データの日付を画面に明示し、営業時間・通行規制・天候・災害時の最新情報に依存する用途に使わないでください。

## 参照

- https://valhalla.github.io/valhalla/api/isochrone/
- https://valhalla.github.io/valhalla/api/route/api-reference/
- https://github.com/valhalla/valhalla/blob/3.9.1/docker/README.md
- https://docs.osmcode.org/osmium/latest/osmium-extract.html
- https://download.geofabrik.de/asia/japan.html
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- https://www.openstreetmap.org/copyright
