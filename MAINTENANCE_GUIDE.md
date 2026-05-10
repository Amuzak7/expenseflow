# ExpenseFlow — 保守・運用ガイド

> 最終更新: 2026-05-09  
> 対象: 自分・将来の引き継ぎ者・ポートフォリオレビュアー

---

## 1. プロジェクト概要

中小企業向けの **経費精算・入金管理 SaaS**。  
会社単位でユーザーを管理し、経費申請・承認・入金照合・月次レポートを一元管理する。

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript 5 |
| バックエンド | Supabase (PostgreSQL + Auth + Storage) |
| スタイル | Tailwind CSS 4 |
| AI 機能 | Claude Vision（領収書 OCR） |
| メール | Resend |
| ホスティング | Vercel（Cron Job 含む） |

---

## 2. ディレクトリ構成

```
expenseflow/
├── app/
│   ├── (auth)/login/          # ログイン画面
│   ├── (dashboard)/           # 認証済みユーザー向け画面
│   │   ├── dashboard/         # ダッシュボード（概要・KPI）
│   │   ├── expenses/          # 経費精算
│   │   ├── incoming-payments/ # 入金確認・CSV照合
│   │   ├── incoming-plans/    # 入金予定管理
│   │   ├── trading-partners/  # 取引先管理
│   │   ├── reports/           # 月次レポート・エクスポート
│   │   └── settings/          # 設定画面（管理者専用タブ含む）
│   ├── api/
│   │   ├── auth/callback/     # Supabase Auth コールバック
│   │   ├── export/            # データエクスポート（Excel）
│   │   ├── admin/users/[id]/  # ユーザー完全削除 API
│   │   ├── admin/cleanup-orphaned-users/ # 孤立ユーザー削除（無効化済み）
│   │   └── cron/cleanup-retired-users/  # 退職30日後の自動削除 Cron
│   └── auth/callback/         # 招待承認コールバック
├── components/
│   ├── ui/                    # shadcn/ui ベースの汎用コンポーネント
│   ├── expenses/              # 経費関連コンポーネント群
│   ├── incoming-payments/     # 入金照合コンポーネント群
│   ├── layout/                # サイドバーナビゲーション
│   └── notifications/         # 通知センター
├── lib/
│   ├── supabase/
│   │   ├── client.ts          # ブラウザ用クライアント
│   │   ├── server.ts          # Server Component 用クライアント
│   │   └── admin.ts           # Service Role クライアント（RLS バイパス）
│   ├── anthropic.ts           # Claude API クライアント
│   ├── claude-vision.ts       # 領収書 OCR ロジック
│   ├── csv-parser.ts          # CSV パース（入金データ）
│   ├── matching.ts            # 入金照合アルゴリズム
│   ├── email.ts               # メール送信（Resend）
│   └── email-templates.ts     # メールテンプレート
├── supabase/migrations/       # 001〜032 の SQL マイグレーション
├── proxy.ts                   # セッション管理（Next.js 16 の middleware 相当）
└── vercel.json                # Cron Job 設定
```

---

## 3. 機能別ファイル対応表

### 3-1. ユーザー管理

| 機能 | 主なファイル |
|---|---|
| ユーザー無効化・復帰・退職処理 | `app/(dashboard)/settings/actions.ts` — `disableUser()` / `restoreUser()` / `retireUser()` |
| ユーザー一覧表示・操作 UI | `app/(dashboard)/settings/UsersTab.tsx` |
| 完全削除 API | `app/api/admin/users/[id]/route.ts` |
| 退職30日後の自動削除 | `app/api/cron/cleanup-retired-users/route.ts` + `vercel.json` |
| 操作ログ記録・表示 | `actions.ts` — `logOperation()` / `fetchOperationLogs()` + `OperationLogsTab.tsx` |
| ユーザー招待 | `actions.ts` — `inviteUser()` + `app/auth/callback/route.ts` |

**変更時の確認ポイント**
- `disableUser()` / `restoreUser()` は Supabase Auth の ban 処理と profiles.status の両方を更新する。片方だけ更新すると不整合になる
- 退職処理（`retireUser()`）は `status = 'deleted'` + `deleted_at` を記録し、30日後に Cron が物理削除する設計
- 操作ログは `user_operation_logs` テーブルに INSERT。RLS で service role のみ書き込み可能なため、必ず `createAdminClient()` を使う
- ユーザー招待後のコールバックは `app/auth/callback/route.ts` で `/settings` のキャッシュを `revalidatePath` している

---

### 3-2. 経費精算

| 機能 | 主なファイル |
|---|---|
| 経費申請・一覧 | `app/(dashboard)/expenses/page.tsx` + `ExpensesClient.tsx` |
| 申請・承認アクション | `app/(dashboard)/expenses/actions.ts` |
| 承認キュー | `app/(dashboard)/expenses/ApprovalQueue.tsx` |
| 領収書アップロード・OCR | `components/expenses/ReceiptUploader.tsx` + `lib/claude-vision.ts` |
| 経費ステータスバッジ | `components/expenses/ExpenseStatusBadge.tsx` |
| 経費詳細モーダル | `components/expenses/ExpenseDetailModal.tsx` |

**変更時の確認ポイント**
- 領収書 OCR は Claude Vision API を呼ぶ。`ANTHROPIC_API_KEY` が必須
- 経費ステータスは `pending / approved / rejected / returned / paid` の5種類。新しいステータスを追加する場合は DB の CHECK 制約・バッジコンポーネント・フィルター UI をすべて更新する
- 金額のバリデーションは `app/(dashboard)/expenses/actions.ts` と Zod スキーマの2重チェック

---

### 3-3. 入金予定 / 入金確認

| 機能 | 主なファイル |
|---|---|
| 入金予定の登録・管理 | `app/(dashboard)/incoming-plans/page.tsx` + `actions.ts` |
| 入金確認・CSV 照合 | `app/(dashboard)/incoming-payments/page.tsx` + `IncomingPaymentsClient.tsx` |
| CSV パース | `lib/csv-parser.ts` |
| 照合アルゴリズム | `lib/matching.ts` |
| 取引先管理 | `app/(dashboard)/trading-partners/` 配下 |

**変更時の確認ポイント**
- CSV フォーマットが変わった場合は `lib/csv-parser.ts` のパースロジックを更新する
- 照合ロジック（金額・日付・取引先のマッチング）は `lib/matching.ts` に集約されている
- 照合結果の確定処理は楽観的更新を使っているため、エラー時のロールバック処理を必ず確認する

---

### 3-4. 月次レポート + エクスポート

| 機能 | 主なファイル |
|---|---|
| レポート画面 | `app/(dashboard)/reports/page.tsx` + `ReportsClient.tsx` |
| データ集計アクション | `app/(dashboard)/reports/actions.ts` |
| Excel エクスポート | `app/api/export/route.ts`（XLSX ライブラリ使用） |

**変更時の確認ポイント**
- エクスポートは Route Handler（`/api/export`）経由。Server Action ではない
- XLSX 出力は `xlsx` ライブラリを使用。列定義を変える場合は `api/export/route.ts` を修正

---

### 3-5. 設定画面

| 機能 | 主なファイル |
|---|---|
| 設定ページ（Server Component） | `app/(dashboard)/settings/page.tsx` |
| 設定タブ管理（Client Component） | `app/(dashboard)/settings/SettingsClient.tsx` |
| 会社情報タブ | `CompanyTab.tsx` |
| ユーザー管理タブ | `UsersTab.tsx` |
| 経費ルールタブ | `ExpenseRulesTab.tsx` |
| 通知設定タブ | `NotificationsTab.tsx` |
| 操作ログタブ | `OperationLogsTab.tsx` |
| 全 Server Actions | `actions.ts` |

**変更時の確認ポイント**
- `page.tsx` はユーザーのロールを判定し、`isAdmin` フラグに応じて管理者専用データの取得 / タブ表示を制御する
- 管理者専用タブを増やす場合は `SettingsClient.tsx` の `ADMIN_TABS` 配列に追加する
- `actions.ts` 内の全プロファイル取得は `getOwnProfile()` ヘルパー（`createAdminClient()` 使用）を通すこと。通常の Supabase クライアントで `profiles` を SELECT すると RLS 再帰エラー（42P17）が発生する（後述）

---

### 3-6. RLS ポリシー関連

| 対象テーブル | ポリシー管理の要点 |
|---|---|
| `profiles` | SELECT は JWT `app_metadata.company_id` ベース。subquery 方式は再帰するため**絶対に使わない** |
| `companies` | admin のみ UPDATE 可能（`is_admin()` 関数 or JWT ベース） |
| `expenses` | 自社内のみ参照・操作可能 |
| `invitations` | admin のみ INSERT / DELETE 可能 |
| `user_operation_logs` | SELECT は admin のみ。INSERT / UPDATE / DELETE は service role のみ |
| `notification_settings` | 自分のレコードのみ操作可能 |

---

## 4. 変更時のチェックリスト

### 新機能を追加するとき

```
□ app/(dashboard)/<新機能>/ にページ・Server Actions・Client を作成
□ 必要なら supabase/migrations/XXX_<説明>.sql を作成して適用
□ 新テーブルには必ず RLS を有効化 (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
□ Server Actions から profiles を SELECT する場合は getOwnProfile() を使う
□ サイドバーナビ (components/layout/Sidebar.tsx) にリンクを追加
□ 型定義が必要なら types/ に追加、または actions.ts 内に export interface を記述
```

### RLS ポリシーを変更するとき

```
□ profiles テーブルに触れる場合は「無限再帰」に注意（後述）
□ subquery 方式 (SELECT ... FROM profiles WHERE id = auth.uid()) は使わない
□ JWT app_metadata ベース ((auth.jwt()->'app_metadata'->>'company_id')::uuid) を使う
□ 新しいポリシーは必ず TO authenticated を指定する（public ロールはNG）
□ 変更後に pg_policies を確認して意図しないポリシーが残っていないかチェック
□ 変更後はブラウザで実際にログアウト→ログインして動作確認（JWT 更新のため）
```

### Supabase のテーブル構造を変更するとき

```
□ supabase/migrations/ に連番で新しい SQL ファイルを作成
□ ADD COLUMN は IF NOT EXISTS を付けて冪等にする
□ DROP COLUMN / DROP TABLE の前に、参照している外部キーを確認する
□ app_metadata に company_id を持つ既存ユーザーへの影響を考慮する
□ actions.ts の型定義 (ProfileWithEmail など) を合わせて更新する
□ マイグレーション適用後、関連する Server Actions の動作を手動確認
```

---

## 5. RLS ポリシー管理

### 現在有効な主要ポリシー（profiles テーブル）

| ポリシー名 | 操作 | ロール | 条件 |
|---|---|---|---|
| `company members can view company profiles` | SELECT | authenticated | JWT `app_metadata.company_id` 一致 OR 自分自身 |
| `自分のプロファイルを更新` | UPDATE | authenticated | `id = auth.uid()` |
| `admin can update company profiles` | UPDATE | authenticated | JWT `company_id` 一致 AND JWT `role = 'admin'` |

### ポリシー追加・変更時の注意点

**⚠️ profiles テーブルで絶対にやってはいけないこと**

```sql
-- ❌ NG: subquery が profiles を参照 → 42P17 無限再帰
CREATE POLICY "bad_policy" ON profiles FOR SELECT
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ✅ OK: JWT から直接取得（DB クエリなし）
CREATE POLICY "good_policy" ON profiles FOR SELECT
  USING (company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid);
```

**なぜ再帰するのか**  
PostgreSQL は RLS ポリシーを評価する際、ポリシー内の subquery にも RLS を適用する。  
`profiles` のポリシーが `profiles` を subquery で参照すると無限ループが発生し `ERROR 42P17` になる。

**JWT app_metadata の仕組み**  
- `auth.users.raw_app_meta_data` に `company_id` を保存（Migration 027 で全ユーザーに適用済み）
- JWT にはこのデータが `app_metadata` として自動的に含まれる
- ユーザーが新規登録すると `handle_new_user()` トリガーが自動的に `app_metadata` を設定する
- JWT は**ログアウト→ログイン**で更新される（ポリシー変更後は再ログイン必須）

---

## 6. よくあるトラブルと対処法

### 🔴 `ERROR 42P17: infinite recursion detected in policy for relation "profiles"`

**原因**: `profiles` のRLSポリシーが `profiles` 自身を subquery で参照している  
**対処**: 該当ポリシーを削除し、JWT `app_metadata` ベースのポリシーに置き換える  

```sql
-- 問題のあるポリシーを確認
SELECT policyname, qual FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'SELECT';

-- 再帰するポリシーを削除して JWT ベースに置き換え
DROP POLICY IF EXISTS "問題のポリシー名" ON public.profiles;
CREATE POLICY "fixed_policy" ON public.profiles FOR SELECT TO authenticated
  USING (company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid OR id = auth.uid());
```

---

### 🔴 設定画面の管理者タブが表示されない / データが取得できない

**原因候補**:
1. `profile.role` が `admin` でない（DB で確認）
2. JWT が古く `app_metadata.company_id` が含まれていない
3. `actions.ts` が `createAdminClient()` でなく通常クライアントで profiles を取得している

**対処**:
```sql
-- 1. ロール確認
SELECT id, role, status FROM profiles WHERE id = '<user_id>';

-- 2. JWT の app_metadata 確認
SELECT id, email, raw_app_meta_data FROM auth.users WHERE id = '<user_id>';
-- company_id がなければ手動で設定
UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"company_id":"<uuid>"}' WHERE id = '<user_id>';
```
→ その後ブラウザでログアウト→ログインして JWT を更新する

---

### 🔴 ユーザーを無効化しても Supabase Auth でログインできてしまう

**原因**: `disableUser()` は `profiles.status = 'inactive'` と Auth の `ban_duration` の**両方**を設定する必要がある  
**確認**: Supabase Dashboard → Authentication → Users → 対象ユーザーの `Banned` フラグを確認  
**対処**: `actions.ts` の `disableUser()` を確認し、ban 処理が正常に呼ばれているか確認する

---

### 🔴 退職ユーザーが自動削除されない（Cron Job が動かない）

**原因候補**:
1. `CRON_SECRET` 環境変数が Vercel に設定されていない
2. `vercel.json` の cron 設定がデプロイされていない
3. cron は Vercel Pro / 本番環境のみで動作（ローカルでは動かない）

**確認**: Vercel Dashboard → Functions → Cron Jobs で実行履歴を確認  
**手動実行**:
```bash
curl -X GET https://<your-domain>/api/cron/cleanup-retired-users \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---

### 🔴 領収書 OCR が動かない

**原因**: `ANTHROPIC_API_KEY` が未設定 or 無効  
**確認**: `.env.local` に `ANTHROPIC_API_KEY=sk-ant-...` が設定されているか確認  
**ローカルテスト**: サーバーコンソールに `anthropic` 関連のエラーが出ていないか確認

---

### 🔴 招待メールが届かない / 招待したユーザーが承認後も招待中に残る

**メール未着の原因**: `RESEND_API_KEY` が未設定 or Resend の送信ドメインが未認証  
**招待中に残る原因**: `app/auth/callback/route.ts` で `revalidatePath("/settings")` が呼ばれていない  
**確認**: Resend Dashboard でメール送信ログを確認

---

## 7. 今後の拡張ポイント

| 優先度 | 機能 | 概要 |
|---|---|---|
| ★★★ | モバイル対応（経費申請） | スマホからの領収書撮影→即時申請フローを最適化。現状 PC 向けレイアウトのみ |
| ★★☆ | プッシュ通知 | 承認待ち・却下通知を Web Push で送る（現状はアプリ内通知のみ） |
| ★★☆ | 経費カテゴリ分析 | 科目別・部門別の傾向グラフをレポート画面に追加 |
| ★☆☆ | 外部会計ソフト連携 | freee / マネーフォワード へのエクスポート対応 |
| ★☆☆ | 多言語対応（i18n） | 英語 UI への切り替え（外国籍社員向け） |
| ★☆☆ | 監査ログの強化 | 現状はユーザー操作ログのみ。経費承認・金額変更のログも記録 |

---

## 8. 重要メモ

### 環境変数

| 変数名 | 用途 | 注意 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | 公開可。`NEXT_PUBLIC_` プレフィックスでブラウザに露出 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 匿名キー（RLS が適用される） | 公開可だが Git には含めない |
| `SUPABASE_SERVICE_ROLE_KEY` | サービスロールキー（RLS バイパス） | **絶対に公開しない。サーバーサイドのみ使用** |
| `ANTHROPIC_API_KEY` | Claude Vision（領収書 OCR） | 課金発生。使用量を Anthropic Console で監視 |
| `RESEND_API_KEY` | 招待メール送信 | Resend の送信ドメイン認証が必要 |
| `CRON_SECRET` | Cron Job の認証トークン | 推測されにくいランダム文字列を設定 |
| `NEXT_PUBLIC_APP_URL` | 招待メールのリダイレクト URL | 本番: `https://<your-domain>` |

### Supabase Dashboard で定期確認すべき場所

| 場所 | 確認内容 |
|---|---|
| Authentication → Users | ban されているユーザー・招待中ユーザーの状態 |
| Table Editor → profiles | `status` / `is_active` / `deleted_at` の整合性 |
| Table Editor → user_operation_logs | 操作ログが正常に記録されているか |
| Database → Functions | `get_user_company_id()` / `is_admin()` / `handle_new_user()` の定義 |
| Database → Policies | 意図しないポリシーが残っていないか（特に `public` ロール） |
| Logs → Edge Functions | エラーログの確認 |

### マイグレーションの扱い方

- ファイル名: `supabase/migrations/XXX_<説明>.sql`（3桁連番）
- 適用方法: **Supabase Dashboard → SQL Editor** に貼り付けて実行
- `IF NOT EXISTS` / `IF EXISTS` を必ず付けて冪等にする
- マイグレーションは後から変更しない。修正が必要なら新しい番号で別ファイルを作成する
- 現在 032 まで適用済み。次は `033_xxx.sql` から

### proxy.ts について

Next.js 16 で `middleware.ts` が廃止され `proxy.ts` に移行した。  
`proxy.ts` はすべてのリクエストで Supabase のセッション（JWT）を更新し、未認証ユーザーを `/login` にリダイレクトする。  
**このファイルを削除・壊すと全ページで RLS が機能しなくなる**（`auth.uid()` が null になる）。

---

*このガイドは ExpenseFlow の開発・運用中に蓄積した知見をまとめたものです。*  
*RLS の設計方針や技術的な判断の背景については `ARCHITECTURE.md` も参照してください。*
