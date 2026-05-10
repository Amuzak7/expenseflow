-- =====================================================
-- Migration 025: ユーザー管理の論理削除・操作ログ設計
-- =====================================================
-- profiles へ status / deleted_at / deleted_by を追加
-- user_operation_logs テーブルを作成
-- is_active と status を自動同期するトリガーを追加
--
-- 【注意】既存の RLS ポリシーはそのまま維持する
-- (001: "同一会社のプロファイルを参照", "自分のプロファイルを更新")
-- (023: "adminが同一会社プロファイルを更新")
-- =====================================================

-- ─────────────────────────────────────────────────
-- 1. profiles テーブルへのカラム追加
-- ─────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status     TEXT         NOT NULL DEFAULT 'active'
    CONSTRAINT profiles_status_check CHECK (status IN ('active', 'inactive', 'deleted')),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID         REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────
-- 2. 既存データのマイグレーション
--    is_active=false の既存ユーザーを inactive に統一
-- ─────────────────────────────────────────────────

UPDATE profiles
SET status = 'inactive'
WHERE is_active = FALSE
  AND status = 'active';

-- ─────────────────────────────────────────────────
-- 3. status → is_active 自動同期トリガー
--    status を変更するだけで is_active が自動追従する
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_is_active_from_status()
RETURNS TRIGGER AS $$
BEGIN
  -- active のみ true、それ以外（inactive / deleted）は false
  NEW.is_active := (NEW.status = 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_is_active ON profiles;
CREATE TRIGGER trg_sync_is_active
  BEFORE INSERT OR UPDATE OF status ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_is_active_from_status();

-- ─────────────────────────────────────────────────
-- 4. user_operation_logs テーブル
-- ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_operation_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        REFERENCES companies(id) ON DELETE SET NULL,
  user_id      UUID        NOT NULL,
  action       TEXT        NOT NULL
    CONSTRAINT user_op_logs_action_check
    CHECK (action IN ('disable', 'restore', 'retire', 'permanent_delete')),
  performed_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason       TEXT,
  metadata     JSONB
);

CREATE INDEX IF NOT EXISTS idx_user_op_logs_company_id   ON user_operation_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_user_op_logs_user_id      ON user_operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_op_logs_performed_at ON user_operation_logs(performed_at DESC);

-- ─────────────────────────────────────────────────
-- 5. user_operation_logs の RLS
--    INSERT/UPDATE/DELETE は service role のみ（admin client 経由）
--    SELECT は管理者が自社ログのみ閲覧可能
-- ─────────────────────────────────────────────────

ALTER TABLE user_operation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin can read own company logs" ON user_operation_logs;
CREATE POLICY "admin can read own company logs"
  ON user_operation_logs FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );
