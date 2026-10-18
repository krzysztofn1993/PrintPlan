ALTER TABLE public.prints
  ADD COLUMN settlement_id uuid,
  ADD COLUMN settled_at timestamptz,
  ADD COLUMN actual_grams numeric,
  ADD CONSTRAINT prints_settlement_fields_consistent CHECK (
    (settlement_id IS NULL AND settled_at IS NULL AND actual_grams IS NULL)
    OR (
      settlement_id IS NOT NULL
      AND settled_at IS NOT NULL
      AND actual_grams IS NOT NULL
      AND actual_grams BETWEEN 0 AND 2147483647
      AND trunc(actual_grams) = actual_grams
    )
  );

CREATE TABLE private.print_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  print_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  expected_version integer NOT NULL CHECK (expected_version > 0),
  actual_grams numeric NOT NULL CHECK (
    actual_grams BETWEEN 0 AND 2147483647
    AND trunc(actual_grams) = actual_grams
  ),
  settled_at timestamptz NOT NULL,
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
  CONSTRAINT print_settlements_user_request_unique UNIQUE (user_id, request_id),
  CONSTRAINT print_settlements_user_print_unique UNIQUE (user_id, print_id)
);

REVOKE ALL ON TABLE private.print_settlements FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.planned_prints WITH (security_invoker = true) AS
SELECT print.id, print.user_id, print.name, print.material, print.colour, print.colour_key,
       print.required_grams, print.version, print.created_at, print.updated_at,
       reservation.id AS reservation_id, reservation.spool_id AS reservation_spool_id,
       reservation.reserved_grams,
       print.settlement_id, print.settled_at, print.actual_grams
FROM public.prints AS print
LEFT JOIN public.print_reservations AS reservation
  ON reservation.user_id = print.user_id AND reservation.print_id = print.id;

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
  v_row public.prints;
  v_current public.prints;
  v_material text;
  v_colour text;
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

  v_material := upper(btrim(regexp_replace(p_material COLLATE "C", U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+' COLLATE "C", ' ', 'g'), ' ') COLLATE "und-x-icu");
  v_colour := btrim(regexp_replace(p_colour COLLATE "C", U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+' COLLATE "C", ' ', 'g'), ' ');
  IF EXISTS (
    SELECT 1 FROM public.print_reservations
    WHERE print_id = p_print_id AND user_id = v_user_id
  ) AND (
    v_material IS DISTINCT FROM v_current.material
    OR lower(v_colour COLLATE "und-x-icu") IS DISTINCT FROM v_current.colour_key
    OR p_required_grams IS DISTINCT FROM v_current.required_grams
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reserved_print_edit_requires_cancellation';
  END IF;

  UPDATE public.prints
  SET name = p_name, material = p_material, colour = p_colour, required_grams = p_required_grams
  WHERE id = p_print_id AND user_id = v_user_id
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;

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
  IF v_print.settlement_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'print_settled';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.print_reservations
    WHERE print_id = p_print_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'already_reserved';
  END IF;

  v_required := private.calculate_reservation_grams(v_print.required_grams, 10);
  SELECT
    COALESCE(jsonb_agg(to_jsonb(eligible) ORDER BY eligible.available_grams, eligible.created_at, eligible.id), '[]'::jsonb),
    (jsonb_agg(eligible.id ORDER BY eligible.available_grams, eligible.created_at, eligible.id)->>0)::uuid
  INTO v_eligible, v_suggested
  FROM (
    SELECT s.id, s.user_id, s.material, s.colour, s.colour_key, s.recorded_grams, s.created_at, s.updated_at,
           COALESCE(sum(r.reserved_grams), 0) AS reserved_grams,
           s.recorded_grams - COALESCE(sum(r.reserved_grams), 0) AS available_grams
    FROM public.spools s
    LEFT JOIN public.print_reservations r ON r.user_id = s.user_id AND r.spool_id = s.id
    WHERE s.user_id = v_user_id AND s.material = v_print.material AND s.colour_key = v_print.colour_key
    GROUP BY s.id
    HAVING s.recorded_grams - COALESCE(sum(r.reserved_grams), 0) >= v_required
  ) eligible;

  RETURN jsonb_build_object(
    'printId', v_print.id,
    'expectedVersion', v_print.version,
    'marginPercent', 10,
    'reservationGrams', v_required,
    'suggestedSpoolId', v_suggested,
    'eligibleSpools', v_eligible
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_print_material(
  p_request_id uuid,
  p_print_id uuid,
  p_expected_version integer,
  p_spool_id uuid,
  p_selection_mode text
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
  v_required numeric;
  v_suggested uuid;
  v_reservation_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated';
  END IF;
  IF p_request_id IS NULL OR p_selection_mode NOT IN ('best_fit', 'manual') THEN
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
       OR v_existing.selection_mode IS DISTINCT FROM p_selection_mode THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'idempotency_conflict';
    END IF;
    IF v_existing.state <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reservation_request_completed';
    END IF;
    RETURN jsonb_build_object('reservationId', v_existing.reservation_id, 'disposition', 'active', 'replayed', true);
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
  IF EXISTS (
    SELECT 1 FROM public.print_reservations
    WHERE print_id = p_print_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'already_reserved';
  END IF;

  v_required := private.calculate_reservation_grams(v_print.required_grams, 10);
  SELECT s.id INTO v_suggested
  FROM public.spools s
  WHERE s.user_id = v_user_id
    AND s.material = v_print.material
    AND s.colour_key = v_print.colour_key
    AND s.recorded_grams - COALESCE((
      SELECT sum(r.reserved_grams) FROM public.print_reservations r
      WHERE r.spool_id = s.id AND r.user_id = v_user_id
    ), 0) >= v_required
  ORDER BY s.recorded_grams - COALESCE((
      SELECT sum(r.reserved_grams) FROM public.print_reservations r
      WHERE r.spool_id = s.id AND r.user_id = v_user_id
    ), 0), s.created_at, s.id
  LIMIT 1;
  IF v_suggested IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_material';
  END IF;
  IF p_selection_mode = 'best_fit' AND p_spool_id IS DISTINCT FROM v_suggested THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'selection_stale';
  END IF;

  SELECT * INTO v_spool
  FROM public.spools s
  WHERE s.id = p_spool_id
    AND s.user_id = v_user_id
    AND s.material = v_print.material
    AND s.colour_key = v_print.colour_key
    AND s.recorded_grams - COALESCE((
      SELECT sum(r.reserved_grams) FROM public.print_reservations r
      WHERE r.spool_id = s.id AND r.user_id = v_user_id
    ), 0) >= v_required
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_material';
  END IF;

  v_reservation_id := gen_random_uuid();
  INSERT INTO public.print_reservations (id, user_id, print_id, spool_id, reserved_grams, margin_percent, selection_mode)
  VALUES (v_reservation_id, v_user_id, p_print_id, p_spool_id, v_required, 10, p_selection_mode);
  INSERT INTO private.reservation_requests (user_id, request_id, print_id, spool_id, expected_version, selection_mode, reservation_id, state)
  VALUES (v_user_id, p_request_id, p_print_id, p_spool_id, p_expected_version, p_selection_mode, v_reservation_id, 'active');
  UPDATE public.prints SET name = name WHERE id = p_print_id AND user_id = v_user_id;
  RETURN jsonb_build_object('reservationId', v_reservation_id, 'disposition', 'active', 'replayed', false);
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
     OR v_reservation_request.spool_id IS DISTINCT FROM v_reservation.spool_id THEN
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
    SELECT r.id AS reservation_id, r.print_id, r.reserved_grams,
           r.created_at, p.name AS print_name, p.material, p.colour
    FROM public.print_reservations r
    JOIN public.prints p ON p.id = r.print_id AND p.user_id = r.user_id
    WHERE r.user_id = v_user_id AND r.spool_id = v_spool.id
    ORDER BY r.created_at DESC, r.id DESC
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

CREATE OR REPLACE FUNCTION public.read_print_settlement(p_print_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_receipt jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated';
  END IF;
  IF p_print_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found';
  END IF;

  SELECT receipt INTO v_receipt
  FROM private.print_settlements
  WHERE user_id = v_user_id AND print_id = p_print_id;
  IF FOUND THEN
    RETURN v_receipt;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.prints
    WHERE id = p_print_id AND user_id = v_user_id AND settlement_id IS NULL
  ) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found';
END;
$$;

REVOKE ALL ON FUNCTION public.settle_print_consumption(uuid, uuid, integer, uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.read_print_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_print_consumption(uuid, uuid, integer, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_print_settlement(uuid) TO authenticated;
