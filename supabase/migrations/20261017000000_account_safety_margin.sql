CREATE TABLE public.account_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  margin_percent numeric NOT NULL,
  version integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_settings_margin_valid CHECK (
    margin_percent BETWEEN 0 AND 100 AND trunc(margin_percent) = margin_percent
  ),
  CONSTRAINT account_settings_version_positive CHECK (version > 0)
);

ALTER TABLE public.account_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_settings_select_own ON public.account_settings
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.account_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_settings TO authenticated;

CREATE FUNCTION public.get_account_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_margin_percent numeric;
  v_version integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated';
  END IF;

  SELECT setting.margin_percent, setting.version
    INTO v_margin_percent, v_version
    FROM public.account_settings AS setting
    WHERE setting.user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('marginPercent', 10, 'version', 0);
  END IF;

  RETURN jsonb_build_object('marginPercent', v_margin_percent, 'version', v_version);
END;
$$;
REVOKE ALL ON FUNCTION public.get_account_settings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_settings() TO authenticated;

CREATE FUNCTION public.save_account_safety_margin(p_margin_percent numeric, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current_version integer;
  v_saved_version integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated';
  END IF;
  IF p_margin_percent IS NULL
     OR p_margin_percent < 0
     OR p_margin_percent > 100
     OR trunc(p_margin_percent) <> p_margin_percent
     OR p_expected_version IS NULL
     OR p_expected_version < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_account_settings';
  END IF;

  PERFORM private.acquire_owner_mutation_lock(v_user_id);

  SELECT setting.version
    INTO v_current_version
    FROM public.account_settings AS setting
    WHERE setting.user_id = v_user_id;
  IF NOT FOUND THEN
    v_current_version := 0;
  END IF;

  IF v_current_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'settings_conflict';
  END IF;

  IF v_current_version = 0 THEN
    INSERT INTO public.account_settings (user_id, margin_percent, version)
      VALUES (v_user_id, p_margin_percent, 1)
      RETURNING version INTO v_saved_version;
  ELSE
    UPDATE public.account_settings AS setting
      SET margin_percent = p_margin_percent,
          version = setting.version + 1,
          updated_at = now()
      WHERE setting.user_id = v_user_id
      RETURNING setting.version INTO v_saved_version;
  END IF;

  RETURN jsonb_build_object('marginPercent', p_margin_percent, 'version', v_saved_version);
END;
$$;
REVOKE ALL ON FUNCTION public.save_account_safety_margin(numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_account_safety_margin(numeric, integer) TO authenticated;

ALTER TABLE private.reservation_requests
  ADD COLUMN expected_reservation_grams numeric,
  ADD CONSTRAINT reservation_requests_expected_grams_valid CHECK (
    expected_reservation_grams IS NULL OR (
      expected_reservation_grams > 0
      AND expected_reservation_grams <= 4294967294
      AND trunc(expected_reservation_grams) = expected_reservation_grams
    )
  );

CREATE OR REPLACE FUNCTION public.preview_print_reservation(p_print_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_print public.prints;
  v_margin_percent numeric;
  v_required numeric;
  v_eligible jsonb;
  v_suggested uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated';
  END IF;

  SELECT * INTO v_print
    FROM public.prints
    WHERE id = p_print_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.print_reservations
    WHERE print_id = p_print_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'already_reserved';
  END IF;

  SELECT COALESCE(
    (SELECT setting.margin_percent
     FROM public.account_settings AS setting
     WHERE setting.user_id = v_user_id),
    10
  ) INTO v_margin_percent;
  v_required := private.calculate_reservation_grams(v_print.required_grams, v_margin_percent);

  SELECT COALESCE(
           jsonb_agg(to_jsonb(eligible) ORDER BY eligible.available_grams, eligible.created_at, eligible.id),
           '[]'::jsonb
         ),
         (jsonb_agg(eligible.id ORDER BY eligible.available_grams, eligible.created_at, eligible.id)->>0)::uuid
    INTO v_eligible, v_suggested
    FROM (
      SELECT spool.id, spool.user_id, spool.material, spool.colour, spool.colour_key,
             spool.recorded_grams, spool.created_at, spool.updated_at,
             COALESCE(sum(reservation.reserved_grams), 0) AS reserved_grams,
             spool.recorded_grams - COALESCE(sum(reservation.reserved_grams), 0) AS available_grams
      FROM public.spools AS spool
      LEFT JOIN public.print_reservations AS reservation
        ON reservation.user_id = spool.user_id AND reservation.spool_id = spool.id
      WHERE spool.user_id = v_user_id
        AND spool.material = v_print.material
        AND spool.colour_key = v_print.colour_key
      GROUP BY spool.id
      HAVING spool.recorded_grams - COALESCE(sum(reservation.reserved_grams), 0) >= v_required
    ) AS eligible;

  RETURN jsonb_build_object(
    'printId', v_print.id,
    'expectedVersion', v_print.version,
    'marginPercent', v_margin_percent,
    'reservationGrams', v_required,
    'suggestedSpoolId', v_suggested,
    'eligibleSpools', v_eligible
  );
END;
$$;

DROP FUNCTION public.reserve_print_material(uuid, uuid, integer, uuid, text);

CREATE FUNCTION public.reserve_print_material(
  p_request_id uuid,
  p_print_id uuid,
  p_expected_version integer,
  p_spool_id uuid,
  p_selection_mode text,
  p_expected_reservation_grams numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_print public.prints;
  v_spool public.spools;
  v_existing private.reservation_requests;
  v_margin_percent numeric;
  v_required numeric;
  v_suggested uuid;
  v_reservation_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_reservation_request';
  END IF;

  PERFORM private.acquire_owner_mutation_lock(v_user_id);

  SELECT * INTO v_existing
    FROM private.reservation_requests
    WHERE user_id = v_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.print_id IS DISTINCT FROM p_print_id
       OR v_existing.spool_id IS DISTINCT FROM p_spool_id
       OR v_existing.expected_version IS DISTINCT FROM p_expected_version
       OR v_existing.selection_mode IS DISTINCT FROM p_selection_mode
       OR v_existing.expected_reservation_grams IS DISTINCT FROM p_expected_reservation_grams THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'idempotency_conflict';
    END IF;
    IF v_existing.state <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reservation_request_completed';
    END IF;
    RETURN jsonb_build_object(
      'reservationId', v_existing.reservation_id,
      'disposition', 'active',
      'replayed', true
    );
  END IF;

  IF p_selection_mode IS NULL OR p_selection_mode NOT IN ('best_fit', 'manual') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_reservation_request';
  END IF;
  IF p_expected_reservation_grams IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reservation_preview_required';
  END IF;
  IF p_expected_reservation_grams <= 0
     OR p_expected_reservation_grams > 4294967294
     OR trunc(p_expected_reservation_grams) <> p_expected_reservation_grams THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_reservation_amount';
  END IF;

  SELECT COALESCE(
    (SELECT setting.margin_percent
     FROM public.account_settings AS setting
     WHERE setting.user_id = v_user_id),
    10
  ) INTO v_margin_percent;

  SELECT * INTO v_print
    FROM public.prints
    WHERE id = p_print_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found';
  END IF;
  IF v_print.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'edit_conflict';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.print_reservations
    WHERE print_id = p_print_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'already_reserved';
  END IF;

  v_required := private.calculate_reservation_grams(v_print.required_grams, v_margin_percent);
  IF v_required IS DISTINCT FROM p_expected_reservation_grams THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reservation_amount_stale';
  END IF;

  SELECT spool.id INTO v_suggested
    FROM public.spools AS spool
    WHERE spool.user_id = v_user_id
      AND spool.material = v_print.material
      AND spool.colour_key = v_print.colour_key
      AND spool.recorded_grams - COALESCE((
        SELECT sum(reservation.reserved_grams)
        FROM public.print_reservations AS reservation
        WHERE reservation.spool_id = spool.id AND reservation.user_id = v_user_id
      ), 0) >= v_required
    ORDER BY spool.recorded_grams - COALESCE((
      SELECT sum(reservation.reserved_grams)
      FROM public.print_reservations AS reservation
      WHERE reservation.spool_id = spool.id AND reservation.user_id = v_user_id
    ), 0), spool.created_at, spool.id
    LIMIT 1;
  IF v_suggested IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_material';
  END IF;
  IF p_selection_mode = 'best_fit' AND p_spool_id IS DISTINCT FROM v_suggested THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'selection_stale';
  END IF;

  SELECT * INTO v_spool
    FROM public.spools AS spool
    WHERE spool.id = p_spool_id
      AND spool.user_id = v_user_id
      AND spool.material = v_print.material
      AND spool.colour_key = v_print.colour_key
      AND spool.recorded_grams - COALESCE((
        SELECT sum(reservation.reserved_grams)
        FROM public.print_reservations AS reservation
        WHERE reservation.spool_id = spool.id AND reservation.user_id = v_user_id
      ), 0) >= v_required
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_material';
  END IF;

  v_reservation_id := gen_random_uuid();
  INSERT INTO public.print_reservations (
    id, user_id, print_id, spool_id, reserved_grams, margin_percent, selection_mode
  ) VALUES (
    v_reservation_id, v_user_id, p_print_id, p_spool_id,
    v_required, v_margin_percent, p_selection_mode
  );
  INSERT INTO private.reservation_requests (
    user_id, request_id, print_id, spool_id, expected_version, selection_mode,
    reservation_id, state, expected_reservation_grams
  ) VALUES (
    v_user_id, p_request_id, p_print_id, p_spool_id, p_expected_version, p_selection_mode,
    v_reservation_id, 'active', p_expected_reservation_grams
  );
  UPDATE public.prints SET name = name WHERE id = p_print_id AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'reservationId', v_reservation_id,
    'disposition', 'active',
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_print_reservation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reserve_print_material(uuid, uuid, integer, uuid, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_print_reservation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_print_material(uuid, uuid, integer, uuid, text, numeric)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
