-- Moumix Finance V2 — achats/ventes/modifications atomiques.
-- Migration additive : aucune table ni donnée existante n'est supprimée.
-- Peut être exécutée plusieurs fois dans le SQL Editor Supabase.

CREATE OR REPLACE FUNCTION public.moumix_apply_trade(
  p_position JSONB,
  p_transaction JSONB,
  p_delete_position BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_position_id UUID;
  v_account_id UUID;
  v_transaction_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '28000';
  END IF;

  v_position_id := (p_position->>'id')::UUID;
  v_account_id := (p_position->>'account_id')::UUID;
  v_transaction_id := (p_transaction->>'id')::UUID;

  IF NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE id = v_account_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Compte introuvable ou non autorisé' USING ERRCODE = '42501';
  END IF;

  IF p_delete_position THEN
    DELETE FROM public.positions
    WHERE id = v_position_id AND user_id = v_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Position introuvable ou non autorisée' USING ERRCODE = '42501';
    END IF;
  ELSE
    INSERT INTO public.positions (
      id, user_id, account_id, symbol, name, exchange, currency,
      qty, price, current, change, change_percent, last_updated
    ) VALUES (
      v_position_id,
      v_user_id,
      v_account_id,
      p_position->>'symbol',
      COALESCE(p_position->>'name', ''),
      COALESCE(p_position->>'exchange', ''),
      COALESCE(p_position->>'currency', 'EUR'),
      (p_position->>'qty')::NUMERIC,
      COALESCE((p_position->>'price')::NUMERIC, 0),
      COALESCE((p_position->>'current')::NUMERIC, 0),
      NULLIF(p_position->>'change', '')::NUMERIC,
      NULLIF(p_position->>'change_percent', '')::NUMERIC,
      NULLIF(p_position->>'last_updated', '')::BIGINT
    )
    ON CONFLICT (id) DO UPDATE SET
      account_id = EXCLUDED.account_id,
      symbol = EXCLUDED.symbol,
      name = EXCLUDED.name,
      exchange = EXCLUDED.exchange,
      currency = EXCLUDED.currency,
      qty = EXCLUDED.qty,
      price = EXCLUDED.price,
      current = EXCLUDED.current,
      change = EXCLUDED.change,
      change_percent = EXCLUDED.change_percent,
      last_updated = EXCLUDED.last_updated
    WHERE public.positions.user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Position non autorisée' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.transactions (
    id, user_id, type, symbol, name, qty, price,
    account_name, ts, old_qty, old_price
  ) VALUES (
    v_transaction_id,
    v_user_id,
    p_transaction->>'type',
    p_transaction->>'symbol',
    COALESCE(p_transaction->>'name', ''),
    (p_transaction->>'qty')::NUMERIC,
    COALESCE((p_transaction->>'price')::NUMERIC, 0),
    COALESCE(p_transaction->>'account_name', ''),
    (p_transaction->>'ts')::BIGINT,
    NULLIF(p_transaction->>'old_qty', '')::NUMERIC,
    NULLIF(p_transaction->>'old_price', '')::NUMERIC
  );

  RETURN jsonb_build_object(
    'position_id', v_position_id,
    'transaction_id', v_transaction_id,
    'deleted', p_delete_position
  );
END;
$$;

REVOKE ALL ON FUNCTION public.moumix_apply_trade(JSONB, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moumix_apply_trade(JSONB, JSONB, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.moumix_apply_trade(JSONB, JSONB, BOOLEAN) IS
  'Applique une position et son historique dans une transaction PostgreSQL unique, limitée à auth.uid().';
