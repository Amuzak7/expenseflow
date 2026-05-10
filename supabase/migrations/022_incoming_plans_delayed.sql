-- ============================================================
-- 022_incoming_plans_delayed.sql
-- incoming_plans に 'delayed' ステータスを追加し、
-- 毎日自動で遅延判定を行う SQL 関数 + pg_cron ジョブを設定する
-- ============================================================

-- ── 1. status CHECK 制約に 'delayed' を追加 ──────────────

-- PostgreSQL は CHECK 制約を ALTER TABLE で直接変更できないため
-- 一度削除して再作成する
ALTER TABLE public.incoming_plans
  DROP CONSTRAINT IF EXISTS incoming_plans_status_check;

ALTER TABLE public.incoming_plans
  ADD CONSTRAINT incoming_plans_status_check
  CHECK (status IN ('pending', 'received', 'cancelled', 'delayed'));

-- コメント更新
COMMENT ON COLUMN public.incoming_plans.status IS
  'pending:未入金 | received:入金済み | cancelled:キャンセル | delayed:遅延（cron が自動設定）';

-- ── 2. delayed_at カラムを追加 ───────────────────────────

ALTER TABLE public.incoming_plans
  ADD COLUMN IF NOT EXISTS delayed_at timestamptz;

COMMENT ON COLUMN public.incoming_plans.delayed_at IS
  '遅延と判定された日時。mark_overdue_incoming_plans() が設定する。';

-- インデックス（遅延件数の集計を高速化）
CREATE INDEX IF NOT EXISTS idx_incoming_plans_delayed
  ON public.incoming_plans (company_id, status)
  WHERE status = 'delayed';

-- ── 3. 遅延判定関数（pg_cron から呼び出す） ───────────────

CREATE OR REPLACE FUNCTION public.mark_overdue_incoming_plans()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER            -- RLS をバイパスして全テナント一括処理
SET search_path = public
AS $$
DECLARE
  v_now        timestamptz := now();
  v_today      date        := CURRENT_DATE;
  v_updated    integer;
BEGIN
  -- pending のまま予定日を過ぎた行を delayed に更新
  UPDATE public.incoming_plans
  SET
    status     = 'delayed',
    delayed_at = v_now,
    updated_at = v_now
  WHERE
    status       = 'pending'
    AND planned_date < v_today;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- 処理結果を JSON で返す（pg_cron のログに記録される）
  RETURN jsonb_build_object(
    'executed_at',  v_now,
    'updated_count', v_updated
  );
END;
$$;

COMMENT ON FUNCTION public.mark_overdue_incoming_plans() IS
  'pending の入金予定のうち planned_date が過去のものを delayed に更新する。
   毎日 pg_cron から自動実行される。SECURITY DEFINER で RLS をバイパス。';

-- ── 4. pg_cron ジョブを登録 ──────────────────────────────
-- ※ pg_cron 拡張が有効な場合のみ実行してください
-- ※ Supabase では Settings > Database > Extensions で pg_cron を有効化してください
--
-- スケジュール: UTC 15:00 = JST 翌 0:00（日本時間 深夜0時）
-- 既存ジョブがあれば上書き

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- 既存ジョブ削除（冪等性のため）
    PERFORM cron.unschedule('mark-overdue-incoming-plans')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'mark-overdue-incoming-plans'
    );

    -- 新規登録
    PERFORM cron.schedule(
      'mark-overdue-incoming-plans',
      '0 15 * * *',   -- UTC 15:00 = JST 00:00
      'SELECT public.mark_overdue_incoming_plans()'
    );

    RAISE NOTICE 'pg_cron ジョブ "mark-overdue-incoming-plans" を登録しました (UTC 15:00 = JST 00:00)';
  ELSE
    RAISE NOTICE 'pg_cron が無効のため cron ジョブは登録されていません。Supabase ダッシュボードで pg_cron を有効化してください。';
  END IF;
END
$$;
