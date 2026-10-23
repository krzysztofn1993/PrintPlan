-- Keep the original reservation command immutable while tracking the allocation
-- currently represented by its stable reservation identity.
ALTER TABLE private.reservation_requests
  ADD COLUMN allocation_spool_id uuid,
  ADD COLUMN recalculated_at timestamptz;

UPDATE private.reservation_requests
SET allocation_spool_id = spool_id,
    recalculated_at = NULL;

ALTER TABLE private.reservation_requests
  ALTER COLUMN allocation_spool_id SET NOT NULL;

COMMENT ON COLUMN private.reservation_requests.allocation_spool_id IS
  'Current spool assignment for release and settlement; intentionally has no spool foreign key so evidence survives deletion.';
COMMENT ON COLUMN private.reservation_requests.recalculated_at IS
  'Non-NULL once an S-05 edit supersedes the original reserve command; legacy requests are backfilled as NULL.';

CREATE OR REPLACE FUNCTION public.reserve_print_material(
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
    IF v_existing.recalculated_at IS NOT NULL THEN
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
  IF v_print.settlement_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'print_settled';
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
    user_id, request_id, print_id, spool_id, allocation_spool_id,
    expected_version, selection_mode, reservation_id, state,
    expected_reservation_grams, recalculated_at
  ) VALUES (
    v_user_id, p_request_id, p_print_id, p_spool_id, p_spool_id,
    p_expected_version, p_selection_mode, v_reservation_id, 'active',
    p_expected_reservation_grams, NULL
  );
  UPDATE public.prints SET name = name WHERE id = p_print_id AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'reservationId', v_reservation_id,
    'disposition', 'active',
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_print(
  p_print_id uuid,
  p_expected_version integer,
  p_name text,
  p_material text,
  p_colour text,
  p_required_grams numeric
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current public.prints;
  v_print public.prints;
  v_reservation public.print_reservations;
  v_request private.reservation_requests;
  v_margin_percent numeric;
  v_required numeric;
  v_selected_spool_id uuid;
  v_selection_mode text;
  v_outcome text;
  v_previous_reservation jsonb;
  v_recalculation jsonb;
  v_print_projection jsonb;
  v_has_reservation boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated';
  END IF;

  PERFORM private.acquire_owner_mutation_lock(v_user_id);
  SELECT * INTO v_current
    FROM public.prints
    WHERE id = p_print_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found';
  END IF;
  IF v_current.settlement_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'print_settled';
  END IF;
  IF v_current.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'edit_conflict';
  END IF;

  -- The print trigger performs the canonical normalization and advances its
  -- version once. All allocation decisions below use these returned fields.
  UPDATE public.prints
    SET name = p_name,
        material = p_material,
        colour = p_colour,
        required_grams = p_required_grams
    WHERE id = p_print_id AND user_id = v_user_id
    RETURNING * INTO v_print;

  SELECT * INTO v_reservation
    FROM public.print_reservations
    WHERE user_id = v_user_id AND print_id = p_print_id
    FOR UPDATE;
  v_has_reservation := FOUND;

  IF v_has_reservation THEN
    SELECT * INTO v_request
      FROM private.reservation_requests
      WHERE user_id = v_user_id
        AND reservation_id = v_reservation.id
        AND print_id = p_print_id
      FOR UPDATE;
    IF NOT FOUND
       OR v_request.state <> 'active'
       OR v_request.allocation_spool_id IS DISTINCT FROM v_reservation.spool_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reservation_changed';
    END IF;

    SELECT COALESCE(
      (SELECT setting.margin_percent
       FROM public.account_settings AS setting
       WHERE setting.user_id = v_user_id),
      10
    ) INTO v_margin_percent;
    v_required := private.calculate_reservation_grams(v_print.required_grams, v_margin_percent);
    v_previous_reservation := jsonb_build_object(
      'id', v_reservation.id,
      'spoolId', v_reservation.spool_id,
      'reservedGrams', v_reservation.reserved_grams
    );

    IF v_reservation.selection_mode = 'manual' THEN
      SELECT spool.id INTO v_selected_spool_id
        FROM public.spools AS spool
        WHERE spool.id = v_reservation.spool_id
          AND spool.user_id = v_user_id
          AND spool.material = v_print.material
          AND spool.colour_key = v_print.colour_key
          AND spool.recorded_grams - COALESCE((
            SELECT sum(other.reserved_grams)
            FROM public.print_reservations AS other
            WHERE other.user_id = v_user_id
              AND other.spool_id = spool.id
              AND other.id <> v_reservation.id
          ), 0) >= v_required;
      IF FOUND THEN
        v_selection_mode := 'manual';
        v_outcome := 'manual_retained';
      END IF;
    END IF;

    IF v_selected_spool_id IS NULL THEN
      SELECT spool.id INTO v_selected_spool_id
        FROM public.spools AS spool
        WHERE spool.user_id = v_user_id
          AND spool.material = v_print.material
          AND spool.colour_key = v_print.colour_key
          AND spool.recorded_grams - COALESCE((
            SELECT sum(other.reserved_grams)
            FROM public.print_reservations AS other
            WHERE other.user_id = v_user_id
              AND other.spool_id = spool.id
              AND other.id <> v_reservation.id
          ), 0) >= v_required
        ORDER BY spool.recorded_grams - COALESCE((
          SELECT sum(other.reserved_grams)
          FROM public.print_reservations AS other
          WHERE other.user_id = v_user_id
            AND other.spool_id = spool.id
            AND other.id <> v_reservation.id
        ), 0), spool.created_at, spool.id
        LIMIT 1;
      IF FOUND THEN
        v_selection_mode := 'best_fit';
        v_outcome := CASE
          WHEN v_reservation.selection_mode = 'manual' THEN 'manual_fallback'
          ELSE 'best_fit'
        END;
      END IF;
    END IF;

    IF v_selected_spool_id IS NULL THEN
      DELETE FROM public.print_reservations
        WHERE id = v_reservation.id AND user_id = v_user_id;
      UPDATE private.reservation_requests
        SET state = 'released',
            completed_at = now(),
            allocation_spool_id = v_reservation.spool_id,
            recalculated_at = now()
        WHERE user_id = v_user_id AND reservation_id = v_reservation.id;
      v_has_reservation := false;
      v_outcome := 'insufficient_material';
    ELSE
      UPDATE public.print_reservations
        SET spool_id = v_selected_spool_id,
            reserved_grams = v_required,
            margin_percent = v_margin_percent,
            selection_mode = v_selection_mode
        WHERE id = v_reservation.id AND user_id = v_user_id
        RETURNING * INTO v_reservation;
      UPDATE private.reservation_requests
        SET allocation_spool_id = v_selected_spool_id,
            recalculated_at = now()
        WHERE user_id = v_user_id AND reservation_id = v_reservation.id;
    END IF;

    v_recalculation := jsonb_build_object(
      'outcome', v_outcome,
      'marginPercent', v_margin_percent,
      'reservationGrams', v_required,
      'previousReservation', v_previous_reservation
    );
  END IF;

  v_print_projection := jsonb_build_object(
    'id', v_print.id,
    'name', v_print.name,
    'material', v_print.material,
    'colour', v_print.colour,
    'requiredGrams', v_print.required_grams,
    'version', v_print.version,
    'createdAt', v_print.created_at,
    'updatedAt', v_print.updated_at,
    'reservation', CASE WHEN v_has_reservation THEN jsonb_build_object(
      'id', v_reservation.id,
      'spoolId', v_reservation.spool_id,
      'reservedGrams', v_reservation.reserved_grams
    ) ELSE NULL::jsonb END,
    'settlement', NULL::jsonb
  );

  RETURN jsonb_build_object(
    'print', v_print_projection,
    'recalculation', v_recalculation
  );
END;
$$;

DROP FUNCTION public.release_print_material(uuid, uuid);

CREATE FUNCTION public.release_print_material(
  p_reservation_id uuid,
  p_print_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_request private.reservation_requests;
  v_reservation public.print_reservations;
  v_current_print public.prints;
  v_print jsonb;
  v_spool jsonb;
  v_disposition text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_release_request';
  END IF;

  PERFORM private.acquire_owner_mutation_lock(v_user_id);
  SELECT * INTO v_request
    FROM private.reservation_requests
    WHERE user_id = v_user_id
      AND reservation_id = p_reservation_id
      AND print_id = p_print_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found';
  END IF;

  SELECT * INTO v_reservation
    FROM public.print_reservations
    WHERE id = p_reservation_id
      AND print_id = p_print_id
      AND user_id = v_user_id;
  IF NOT FOUND OR v_request.state <> 'active' THEN
    v_disposition := 'already_released';
  ELSE
    SELECT * INTO v_current_print
      FROM public.prints
      WHERE id = p_print_id AND user_id = v_user_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found';
    END IF;
    IF v_current_print.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'edit_conflict';
    END IF;

    DELETE FROM public.print_reservations
      WHERE id = p_reservation_id AND print_id = p_print_id AND user_id = v_user_id;
    UPDATE private.reservation_requests
      SET state = 'released', completed_at = now()
      WHERE user_id = v_user_id AND reservation_id = p_reservation_id;
    UPDATE public.prints
      SET name = name
      WHERE id = p_print_id AND user_id = v_user_id;
    v_disposition := 'released';
  END IF;

  SELECT to_jsonb(print) INTO v_print
    FROM public.prints AS print
    WHERE print.id = v_request.print_id AND print.user_id = v_user_id;
  SELECT to_jsonb(spool) || jsonb_build_object(
      'reserved_grams', inventory.reserved_grams,
      'available_grams', inventory.available_grams
    ) INTO v_spool
    FROM public.spool_inventory AS inventory
    JOIN public.spools AS spool ON spool.id = inventory.id
    WHERE inventory.id = v_request.allocation_spool_id
      AND inventory.user_id = v_user_id;

  RETURN jsonb_build_object(
    'reservationId', p_reservation_id,
    'disposition', v_disposition,
    'print', v_print,
    'spool', v_spool
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_print_consumption(
  p_request_id uuid,
  p_print_id uuid,
  p_expected_version integer,
  p_reservation_id uuid,
  p_actual_grams numeric
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_request private.print_settlements;
  v_existing_print private.print_settlements;
  v_print public.prints;
  v_reservation public.print_reservations;
  v_reservation_request private.reservation_requests;
  v_spool public.spools;
  v_candidate record;
  v_settlement_id uuid := gen_random_uuid();
  v_settled_at timestamptz := now();
  v_recorded_after numeric;
  v_reserved_after numeric;
  v_cancelled jsonb := '[]'::jsonb;
  v_receipt jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated';
  END IF;
  IF p_request_id IS NULL
     OR p_print_id IS NULL
     OR p_expected_version IS NULL
     OR p_expected_version <= 0
     OR p_reservation_id IS NULL
     OR p_actual_grams IS NULL
     OR p_actual_grams < 0
     OR p_actual_grams > 2147483647
     OR trunc(p_actual_grams) <> p_actual_grams THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_settlement_request';
  END IF;

  PERFORM private.acquire_owner_mutation_lock(v_user_id);

  SELECT * INTO v_existing_request
    FROM private.print_settlements
    WHERE user_id = v_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing_request.print_id IS DISTINCT FROM p_print_id
       OR v_existing_request.expected_version IS DISTINCT FROM p_expected_version
       OR v_existing_request.reservation_id IS DISTINCT FROM p_reservation_id
       OR v_existing_request.actual_grams IS DISTINCT FROM p_actual_grams THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object('settlement', v_existing_request.receipt, 'replayed', true);
  END IF;

  SELECT * INTO v_existing_print
    FROM private.print_settlements
    WHERE user_id = v_user_id AND print_id = p_print_id;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'already_settled';
  END IF;

  SELECT * INTO v_print
    FROM public.prints
    WHERE id = p_print_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found';
  END IF;
  IF v_print.settlement_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'print_settled';
  END IF;
  IF v_print.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'edit_conflict';
  END IF;

  SELECT * INTO v_reservation
    FROM public.print_reservations
    WHERE user_id = v_user_id AND print_id = p_print_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reservation_required';
  END IF;
  IF v_reservation.id IS DISTINCT FROM p_reservation_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reservation_changed';
  END IF;

  SELECT * INTO v_reservation_request
    FROM private.reservation_requests
    WHERE user_id = v_user_id AND reservation_id = v_reservation.id;
  IF NOT FOUND
     OR v_reservation_request.state <> 'active'
     OR v_reservation_request.print_id IS DISTINCT FROM p_print_id
     OR v_reservation_request.allocation_spool_id IS DISTINCT FROM v_reservation.spool_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reservation_changed';
  END IF;

  SELECT * INTO v_spool
    FROM public.spools
    WHERE id = v_reservation.spool_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reservation_changed';
  END IF;

  v_recorded_after := greatest(0::numeric, v_spool.recorded_grams - p_actual_grams);
  DELETE FROM public.print_reservations
    WHERE id = v_reservation.id AND user_id = v_user_id;
  UPDATE private.reservation_requests
    SET state = 'released', completed_at = v_settled_at
    WHERE user_id = v_user_id AND reservation_id = v_reservation.id;

  SELECT COALESCE(sum(reserved_grams), 0)
    INTO v_reserved_after
    FROM public.print_reservations
    WHERE user_id = v_user_id AND spool_id = v_spool.id;

  FOR v_candidate IN
    SELECT reservation.id AS reservation_id, reservation.print_id, reservation.reserved_grams,
           reservation.created_at, print.name AS print_name, print.material, print.colour
      FROM public.print_reservations AS reservation
      JOIN public.prints AS print
        ON print.id = reservation.print_id AND print.user_id = reservation.user_id
      WHERE reservation.user_id = v_user_id AND reservation.spool_id = v_spool.id
      ORDER BY reservation.created_at DESC, reservation.id DESC
  LOOP
    EXIT WHEN v_reserved_after <= v_recorded_after;

    UPDATE public.prints
      SET name = name
      WHERE id = v_candidate.print_id AND user_id = v_user_id;
    DELETE FROM public.print_reservations
      WHERE id = v_candidate.reservation_id AND user_id = v_user_id;
    UPDATE private.reservation_requests
      SET state = 'released', completed_at = v_settled_at
      WHERE user_id = v_user_id AND reservation_id = v_candidate.reservation_id;

    v_reserved_after := v_reserved_after - v_candidate.reserved_grams;
    v_cancelled := v_cancelled || jsonb_build_array(jsonb_build_object(
      'reservationId', v_candidate.reservation_id,
      'printId', v_candidate.print_id,
      'printName', v_candidate.print_name,
      'material', v_candidate.material,
      'colour', v_candidate.colour,
      'releasedGrams', v_candidate.reserved_grams
    ));
  END LOOP;

  UPDATE public.spools
    SET recorded_grams = v_recorded_after
    WHERE id = v_spool.id AND user_id = v_user_id
      AND recorded_grams IS DISTINCT FROM v_recorded_after;

  UPDATE public.prints
    SET settlement_id = v_settlement_id,
        settled_at = v_settled_at,
        actual_grams = p_actual_grams
    WHERE id = p_print_id AND user_id = v_user_id;

  v_receipt := jsonb_build_object(
    'schemaVersion', 1,
    'id', v_settlement_id,
    'requestId', p_request_id,
    'printId', p_print_id,
    'reservationId', v_reservation.id,
    'expectedVersion', p_expected_version,
    'actualGrams', p_actual_grams,
    'settledAt', v_settled_at,
    'exceededEstimate', p_actual_grams > v_spool.recorded_grams,
    'print', jsonb_build_object(
      'id', v_print.id,
      'name', v_print.name,
      'material', v_print.material,
      'colour', v_print.colour,
      'requiredGrams', v_print.required_grams
    ),
    'spool', jsonb_build_object(
      'id', v_spool.id,
      'material', v_spool.material,
      'colour', v_spool.colour,
      'recordedGramsBefore', v_spool.recorded_grams,
      'recordedGramsAfter', v_recorded_after,
      'reservedGramsAfter', v_reserved_after,
      'availableGramsAfter', v_recorded_after - v_reserved_after
    ),
    'releasedGrams', v_reservation.reserved_grams,
    'cancelledReservations', v_cancelled
  );

  INSERT INTO private.print_settlements (
    id, user_id, request_id, print_id, reservation_id, expected_version,
    actual_grams, settled_at, receipt
  ) VALUES (
    v_settlement_id, v_user_id, p_request_id, p_print_id, v_reservation.id,
    p_expected_version, p_actual_grams, v_settled_at, v_receipt
  );

  RETURN jsonb_build_object('settlement', v_receipt, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_print_material(uuid, uuid, integer, uuid, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_print_material(uuid, uuid, integer, uuid, text, numeric)
  TO authenticated;
REVOKE ALL ON FUNCTION public.update_print(uuid, integer, text, text, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_print(uuid, integer, text, text, text, numeric)
  TO authenticated;
REVOKE ALL ON FUNCTION public.release_print_material(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_print_material(uuid, uuid, integer)
  TO authenticated;
REVOKE ALL ON FUNCTION public.settle_print_consumption(uuid, uuid, integer, uuid, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_print_consumption(uuid, uuid, integer, uuid, numeric)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
