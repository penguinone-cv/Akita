# Akita

Akitaは、家族で共通の在庫を管理するスマートフォン対応Webアプリです。公開環境ではNext.jsをDockerで動かし、PostgreSQLへ在庫を保存します。

## 主な構成

- 公開パス: `APP_BASE_PATH` で指定（既定値 `/dogs/akita`）
- アプリの待受ポート: `3101`
- 本番公開: Cloudflare → Ubuntu nginx → `127.0.0.1:3101` → Next.js
- データベース: PostgreSQL（外部ポート非公開）
- リアルタイム更新: Server-Sent Events（SSE）

## ローカル開発

Node.js 24とpnpm 11.9を使用します。

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install
```

`.env.example` を `.env` にコピーします。`APP_BASE_PATH` がブラウザから見える公開パスです。サンプルの `DATABASE_URL` はCompose内のDBホスト名 `db` を使用しているため、ホスト上で `pnpm dev` を実行する場合は `db` を `localhost` に変更し、開発用PostgreSQLを5432番で用意してください。その後、次を実行します。

```bash
pnpm db:deploy
pnpm dev
```

既定設定では、画面を `http://localhost:3101/dogs/akita` で確認できます。

## テスト

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 本番デプロイ

Docker Compose、Ubuntu nginx、Cloudflare、マイグレーション、バックアップ、更新手順は [docs/deployment.md](docs/deployment.md) を参照してください。

合意した初期版の機能と対象外事項は [docs/requirements.md](docs/requirements.md) にまとめています。
