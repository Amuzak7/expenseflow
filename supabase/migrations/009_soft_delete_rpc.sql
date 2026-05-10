-- trading_partners ソフトデリート用 RPC 関数
--
-- 【背景】
-- Supabase/PostgREST は UPDATE 後に内部的に RETURNING を発行するため、
-- SELECT ポリシーの USING 式（deleted_at IS NULL）が更新後の新行にも適用される。
-- その結果、deleted_at をセットする UPDATE が SELECT ポリシーに弾かれる。
--
-- 【解決策】
-- SECURITY DEFINER 関数内で UPDATE を実行して RLS を回避する。
-- 関数内で company_id チェックを行うため、セキュリティは維持される。

CREATE OR REPLACE FUNCTION public.soft_delete_trading_partner(p_partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- ログインユーザーの company_id を取得
  v_company_id := public.get_user_company_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: company not found';
  END IF;

  -- 所有権チェック付きでソフトデリートを実行
  UPDATE public.trading_partners
  SET
    deleted_at = now(),
    deleted_by = auth.uid()
  WHERE
    id          = p_partner_id
    AND company_id  = v_company_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trading partner not found or already deleted';
  END IF;
END;
$$;

-- authenticated ロールに実行権限を付与
GRANT EXECUTE ON FUNCTION public.soft_delete_trading_partner(uuid) TO authenticated;
