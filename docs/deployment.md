# 本番デプロイ手順

この文書は、Ubuntu 22.04上でAkitaをDocker Composeにより稼働させ、ホスト側nginxとCloudflareを経由して公開する手順です。以下では `APP_BASE_PATH=/dogs/akita` を例にします。アプリはホストの `127.0.0.1:3101` だけに公開し、PostgreSQLはDockerネットワーク内だけで利用します。

> Ubuntu 22.04 LTSの標準セキュリティ保守は2027年5月までです。継続利用する場合はUbuntu Proを有効にするか、それまでに新しいLTSへ更新してください。

## 1. 前提条件

- Ubuntu 22.04 LTS
- Docker EngineとDocker Compose v2プラグイン
- Ubuntuホスト上のnginx
- Cloudflareでプロキシ済みのDNSレコード
- nginxのTLS証明書（Let's EncryptまたはCloudflare Origin CA）

Dockerとnginxにはセキュリティ更新を適用し、SSH、HTTP、HTTPS以外の不要な受信ポートは閉じてください。3101番とPostgreSQLの5432番をインターネットへ公開しないでください。

## 2. 環境変数

プロジェクト直下に、Git管理しない `.env` を作成します。権限は所有者だけが読めるようにしてください。

```dotenv
POSTGRES_DB=akita
POSTGRES_USER=akita
POSTGRES_PASSWORD=十分に長いランダムな値
DATABASE_URL=postgresql://akita:URLエンコード済みのパスワード@db:5432/akita?schema=public
APP_BASE_PATH=/dogs/akita
DEFAULT_HOUSEHOLD_ID=00000000-0000-4000-8000-000000000001
APP_IMAGE_TAG=2026-08-04-01
```

`APP_BASE_PATH` は先頭 `/` 付きで指定します。値を変更した場合は、nginxの `location` も同じパスへ変更してアプリイメージを再ビルドしてください。Next.jsの公開パスはビルド成果物へ埋め込まれるため、起動中のコンテナの環境変数だけを変更しても切り替わりません。

`DATABASE_URL` 内のパスワードに `@`、`:`、`/`、`#` などが含まれる場合はURLエンコードが必要です。`DEFAULT_HOUSEHOLD_ID` は初回起動後に変更すると別の空の世帯へ切り替わるため、同じ値を維持してください。`.env` とバックアップをリポジトリへ追加しないでください。

## 3. ビルドと初回起動

```bash
docker compose build --pull
docker compose up -d --remove-orphans
docker compose ps --all
```

Composeは次の順序で起動します。

1. PostgreSQLが正常になるまで待つ
2. `migrate` サービスが `prisma migrate deploy` を一回実行する
3. マイグレーションが終了コード0で完了した場合だけ `app` を起動する

`migrate` が `Exited (0)` と表示されるのは正常です。失敗した場合、アプリは起動しません。原因を修正してから次を再実行します。

```bash
docker compose up --no-deps migrate
docker compose up -d app
```

初期マイグレーションが既定のHouseholdと「未分類」カテゴリを再実行安全な形で作成するため、通常はseed操作を追加で行う必要はありません。明示的にseedを再適用したい場合だけ次を実行します。seedは再実行安全ですが、本番では目的を確認してから実行してください。

```bash
docker compose run --rm migrate pnpm db:seed
```

## 4. nginx

サンプルは [`docker/nginx/akita.conf.example`](../docker/nginx/akita.conf.example) にあります。

- `upstream akita_next` はnginxの `http` コンテキストへ置きます。
- 同じホスト名ですでに別アプリを公開している場合、新しい `server` ブロックを作らず、3個の `location` を既存のTLS `server` ブロックへ追加します。
- サンプル内の `/dogs/akita` は、`.env` の `APP_BASE_PATH` を変更した場合にすべて同じ値へ置き換えます。
- `server_name` と証明書パスを実環境に合わせます。
- `proxy_pass http://akita_next;` の末尾に `/` を付けません。付けると `/dogs/akita` が上流へ渡らず、Next.jsの `basePath` と一致しなくなります。
- `/dogs/akita` を末尾スラッシュ付きURLへnginxで強制転送しません。

反映前に必ず設定を検査します。

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Next.jsコンテナは `127.0.0.1:3101` にだけバインドされるため、nginxは同じUbuntuホストから接続できますが、外部から3101番へ直接接続できません。

## 5. SSE

リアルタイム更新の公開エンドポイントは `/dogs/akita/api/events` です。nginxサンプルでは、このlocationだけ次を設定しています。

- `proxy_http_version 1.1`
- `proxy_buffering off`
- `proxy_cache off`
- `proxy_read_timeout 3600s`
- 上流への `Accept-Encoding` を空にし、gzipを無効化

アプリ側は接続直後にデータを送り、その後も定期的にheartbeatを送ります。SSEレスポンスは `Cache-Control: no-store, no-transform` と `X-Accel-Buffering: no` を返します。SSEは通知経路であり、在庫の正本はPostgreSQLです。再接続時には最新スナップショットを再取得するため、デプロイや一時的な切断で整合性を失いません。

## 6. Cloudflare

Cloudflareでは次を設定します。

1. SSL/TLS暗号化モードを **Full (strict)** にする
2. `/dogs/akita/api/*` に **Bypass cache** のCache Ruleを作り、`Cache Everything` より優先する
3. オリジン側443番は可能ならCloudflare公式IP範囲だけを許可する
4. 既存のTransform Ruleが `/dogs/akita` を削除していないことを確認する

Cache Ruleの条件には `starts_with(http.request.uri.path, "/dogs/akita/api/")` を使用できます。Cloudflareの標準的なオリジン向けProxy Read Timeout（125秒）を十分下回るよう、SSEは15～30秒間隔でheartbeatを送ります。

この初期版にはアプリ内認証がないため、URLを知った第三者は在庫を変更できます。情報の閲覧だけでなく、書き換えや削除のリスクも許容できるか確認してください。CloudflareのRate Limiting Ruleで `/dogs/akita/api/*` の異常な連続アクセスを制限し、将来Discordログインを追加するまではCloudflare Accessや共有パスワードを入口に置く方法も有効です。

利用者IPをnginxのレート制限やログで使う場合は、Cloudflare公式IP範囲だけを信頼元として `CF-Connecting-IP` をreal-ipモジュールへ設定してください。オリジンへ直接接続できる状態で同ヘッダーを無条件に信用すると、IPを偽装できます。

## 7. 動作確認

最初にUbuntuホスト上で、nginxを経由せずアプリを確認します。

```bash
curl --fail --silent --show-error http://127.0.0.1:3101/dogs/akita/api/health
```

次に公開URLを確認します。

```bash
curl --fail --silent --show-error https://<hostname>/dogs/akita/api/health
curl --no-buffer --max-time 35 https://<hostname>/dogs/akita/api/events
```

SSEでは接続直後のイベントまたはコメントと、35秒以内のheartbeatを確認します。ブラウザでは次も確認します。

- `/dogs/akita` が表示される
- JavaScriptとCSSが `/dogs/akita/_next/` から取得される
- 在庫変更が別タブへ反映される
- 開発者ツールでSSEがキャッシュから返っていない

障害調査には次を使います。

```bash
docker compose ps --all
docker compose logs --tail 200 app
docker compose logs --tail 200 migrate
docker compose logs --tail 200 db
sudo journalctl -u nginx --since today
```

## 8. バックアップ

バックアップスクリプトは [`docker/scripts/backup-postgres.sh`](../docker/scripts/backup-postgres.sh) です。プロジェクト直下で次を実行します。

```bash
bash docker/scripts/backup-postgres.sh
```

`backups/akita-<UTC時刻>.dump` とSHA-256チェックサムが作成されます。バックアップは必ず暗号化された別サーバーまたはオブジェクトストレージへコピーしてください。同じUbuntuサーバー内だけでは、ディスク障害に備えられません。

推奨保持期間:

- 日次: 7世代
- 週次: 4世代
- 月次: 6世代

少なくとも四半期ごとに、別の空データベースへ復元して、バックアップが読み取れることと主要件数を確認します。復元訓練で本番データベースを上書きしないでください。

## 9. 更新

更新直前にバックアップを取得し、`.env` の `APP_IMAGE_TAG` を新しい一意な値へ変更します。同じタグを再利用しないとロールバックが容易です。

```bash
bash docker/scripts/backup-postgres.sh
docker compose build --pull
docker compose up -d --remove-orphans
docker compose ps --all
```

新しい `migrate` イメージが一回実行され、成功後に新しいアプリが起動します。更新後はhealth、画面、SSE、在庫の増減を確認します。

アプリを以前のイメージへ戻しても、DBマイグレーションは自動で巻き戻りません。マイグレーションは原則として旧アプリとも共存できる変更にし、破壊的変更は別のリリースで段階的に行ってください。

## 10. 定常運用

- 外形監視で `/dogs/akita/api/health` を確認する
- ディスク使用量、PostgreSQL volume、コンテナ再起動回数を監視する
- DockerログはComposeで1ファイル10MB、3世代に制限済み
- OS、Docker、nginxのセキュリティ更新を定期適用する
- PostgreSQLとNode.jsのメジャーバージョンは計画的に更新し、`latest` タグを使わない
- 秘密情報をログ、Dockerイメージ、Gitへ含めない

この構成はアプリ1台を前提としています。SSE購読者はプロセス内で管理でき、再起動時はブラウザが再接続します。将来アプリを複数台にする場合は、PostgreSQL `LISTEN/NOTIFY` またはRedisなどを配信基盤にし、どのアプリへ接続しても同じ更新を受け取れるようにします。

## 参考資料

- [Next.js: basePath](https://nextjs.org/docs/pages/api-reference/config/next-config-js/basePath)
- [Next.js: Self-Hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js: standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [nginx: ngx_http_proxy_module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Docker: Port publishing and mapping](https://docs.docker.com/engine/network/port-publishing/)
- [Docker Compose: Startup order](https://docs.docker.com/compose/how-tos/startup-order/)
- [Cloudflare: Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
- [Cloudflare: Connection limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/)
- [Cloudflare: Origin Cache Control](https://developers.cloudflare.com/cache/concepts/cache-control/)
- [Cloudflare: Origin IP protection](https://developers.cloudflare.com/fundamentals/concepts/cloudflare-ip-addresses/)
- [Ubuntu release cycle](https://ubuntu.com/about/release-cycle)
