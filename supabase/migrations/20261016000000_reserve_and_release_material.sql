CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.spools ADD CONSTRAINT spools_id_user_id_unique UNIQUE (id, user_id);
ALTER TABLE public.prints ADD CONSTRAINT prints_id_user_id_unique UNIQUE (id, user_id);

CREATE TABLE public.print_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  print_id uuid NOT NULL,
  spool_id uuid NOT NULL,
  reserved_grams numeric NOT NULL,
  margin_percent numeric NOT NULL,
  selection_mode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_reservations_positive_grams CHECK (
    reserved_grams > 0 AND reserved_grams <= 4294967294 AND trunc(reserved_grams) = reserved_grams
  ),
  CONSTRAINT print_reservations_margin_valid CHECK (margin_percent BETWEEN 0 AND 100),
  CONSTRAINT print_reservations_selection_mode CHECK (selection_mode IN ('best_fit', 'manual')),
  CONSTRAINT print_reservations_print_owner_fk FOREIGN KEY (print_id, user_id)
    REFERENCES public.prints (id, user_id) ON DELETE CASCADE,
  CONSTRAINT print_reservations_spool_owner_fk FOREIGN KEY (spool_id, user_id)
    REFERENCES public.spools (id, user_id) ON DELETE CASCADE,
  CONSTRAINT print_reservations_one_per_print UNIQUE (print_id)
);

CREATE INDEX print_reservations_user_spool_idx
  ON public.print_reservations (user_id, spool_id);
ALTER TABLE public.print_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY print_reservations_select_own ON public.print_reservations
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.print_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.print_reservations TO authenticated;

CREATE TABLE private.owner_mutation_mutex (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE TABLE private.reservation_requests (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  print_id uuid NOT NULL,
  spool_id uuid NOT NULL,
  expected_version integer NOT NULL,
  selection_mode text NOT NULL CHECK (selection_mode IN ('best_fit', 'manual')),
  reservation_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'released', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, request_id),
  UNIQUE (user_id, reservation_id)
);

CREATE FUNCTION private.acquire_owner_mutation_lock(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO private.owner_mutation_mutex (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM private.owner_mutation_mutex WHERE user_id = p_user_id FOR UPDATE;
END;
$$;
REVOKE ALL ON FUNCTION private.acquire_owner_mutation_lock(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.calculate_reservation_grams(p_required_grams numeric, p_margin_percent numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ceil(p_required_grams * (100 + p_margin_percent) / 100)
$$;
REVOKE ALL ON FUNCTION private.calculate_reservation_grams(numeric,numeric) FROM PUBLIC, anon, authenticated;

CREATE VIEW public.spool_inventory WITH (security_invoker = true) AS
SELECT spool.id, spool.user_id, spool.material, spool.colour, spool.colour_key,
       spool.recorded_grams, spool.created_at, spool.updated_at,
       COALESCE(reserved.reserved_grams, 0::numeric) AS reserved_grams,
       spool.recorded_grams - COALESCE(reserved.reserved_grams, 0::numeric) AS available_grams
FROM public.spools AS spool
LEFT JOIN (
  SELECT reservation.user_id, reservation.spool_id, sum(reservation.reserved_grams) AS reserved_grams
  FROM public.print_reservations AS reservation
  GROUP BY reservation.user_id, reservation.spool_id
) AS reserved ON reserved.user_id = spool.user_id AND reserved.spool_id = spool.id;

CREATE VIEW public.planned_prints WITH (security_invoker = true) AS
SELECT print.id, print.user_id, print.name, print.material, print.colour, print.colour_key,
       print.required_grams, print.version, print.created_at, print.updated_at,
       reservation.id AS reservation_id, reservation.spool_id AS reservation_spool_id,
       reservation.reserved_grams
FROM public.prints AS print
LEFT JOIN public.print_reservations AS reservation
  ON reservation.user_id = print.user_id AND reservation.print_id = print.id;

REVOKE ALL ON public.spool_inventory, public.planned_prints FROM PUBLIC, anon;
GRANT SELECT ON public.spool_inventory, public.planned_prints TO authenticated;

CREATE FUNCTION public.create_spool(p_material text, p_colour text, p_recorded_grams numeric)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid := auth.uid(); v_row public.spools;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated'; END IF;
  PERFORM private.acquire_owner_mutation_lock(v_user_id);
  IF p_recorded_grams <= 0 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_spool'; END IF;
  INSERT INTO public.spools (user_id, material, colour, recorded_grams)
  VALUES (v_user_id, p_material, p_colour, p_recorded_grams) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE FUNCTION public.update_spool(p_spool_id uuid, p_material text, p_colour text, p_recorded_grams numeric)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid := auth.uid(); v_row public.spools; v_reserved numeric;
        v_material text; v_colour text; v_current public.spools;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated'; END IF;
  PERFORM private.acquire_owner_mutation_lock(v_user_id);
  SELECT * INTO v_current FROM public.spools WHERE id = p_spool_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found'; END IF;
  SELECT COALESCE(sum(reserved_grams), 0) INTO v_reserved FROM public.print_reservations
    WHERE spool_id = p_spool_id AND user_id = v_user_id;
  v_material := upper(btrim(regexp_replace(p_material COLLATE "C", U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+' COLLATE "C", ' ', 'g'), ' ') COLLATE "und-x-icu");
  v_colour := btrim(regexp_replace(p_colour COLLATE "C", U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+' COLLATE "C", ' ', 'g'), ' ');
  IF v_reserved > 0 AND (v_material IS DISTINCT FROM v_current.material OR lower(v_colour COLLATE "und-x-icu") IS DISTINCT FROM v_current.colour_key) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reserved_spool_change_requires_cancellation';
  END IF;
  IF p_recorded_grams < v_reserved THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'stock_below_reservations';
  END IF;
  UPDATE public.spools SET material = p_material, colour = p_colour, recorded_grams = p_recorded_grams
    WHERE id = p_spool_id AND user_id = v_user_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE FUNCTION public.delete_spool(p_spool_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid := auth.uid(); v_cancelled jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated'; END IF;
  PERFORM private.acquire_owner_mutation_lock(v_user_id);
  PERFORM 1 FROM public.spools WHERE id = p_spool_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('reservationId', r.id, 'printId', r.print_id,
      'printName', p.name, 'material', p.material, 'colour', p.colour, 'releasedGrams', r.reserved_grams)
      ORDER BY r.created_at, r.id), '[]'::jsonb)
    INTO v_cancelled
    FROM public.print_reservations r JOIN public.prints p ON p.id = r.print_id AND p.user_id = r.user_id
    WHERE r.user_id = v_user_id AND r.spool_id = p_spool_id;
  UPDATE public.prints p SET name = p.name WHERE p.id IN
    (SELECT print_id FROM public.print_reservations WHERE user_id = v_user_id AND spool_id = p_spool_id);
  UPDATE private.reservation_requests q SET state = 'deleted', completed_at = now()
    FROM public.print_reservations r WHERE q.user_id = v_user_id AND q.reservation_id = r.id
      AND r.user_id = v_user_id AND r.spool_id = p_spool_id;
  DELETE FROM public.print_reservations WHERE user_id = v_user_id AND spool_id = p_spool_id;
  DELETE FROM public.spools WHERE id = p_spool_id AND user_id = v_user_id;
  RETURN jsonb_build_object('id', p_spool_id, 'cancelledReservations', v_cancelled);
END;
$$;

CREATE FUNCTION public.create_print(p_name text, p_material text, p_colour text, p_required_grams numeric)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid := auth.uid(); v_row public.prints;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated'; END IF;
  PERFORM private.acquire_owner_mutation_lock(v_user_id);
  INSERT INTO public.prints (user_id, name, material, colour, required_grams)
    VALUES (v_user_id, p_name, p_material, p_colour, p_required_grams) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE FUNCTION public.update_print(p_print_id uuid, p_expected_version integer, p_name text, p_material text, p_colour text, p_required_grams numeric)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid := auth.uid(); v_row public.prints; v_current public.prints;
        v_material text; v_colour text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated'; END IF;
  PERFORM private.acquire_owner_mutation_lock(v_user_id);
  SELECT * INTO v_current FROM public.prints WHERE id = p_print_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found'; END IF;
  IF v_current.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'edit_conflict'; END IF;
  v_material := upper(btrim(regexp_replace(p_material COLLATE "C", U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+' COLLATE "C", ' ', 'g'), ' ') COLLATE "und-x-icu");
  v_colour := btrim(regexp_replace(p_colour COLLATE "C", U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+' COLLATE "C", ' ', 'g'), ' ');
  IF EXISTS (SELECT 1 FROM public.print_reservations WHERE print_id = p_print_id AND user_id = v_user_id)
     AND (v_material IS DISTINCT FROM v_current.material OR lower(v_colour COLLATE "und-x-icu") IS DISTINCT FROM v_current.colour_key OR p_required_grams IS DISTINCT FROM v_current.required_grams) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reserved_print_edit_requires_cancellation';
  END IF;
  UPDATE public.prints SET name = p_name, material = p_material, colour = p_colour, required_grams = p_required_grams
    WHERE id = p_print_id AND user_id = v_user_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE FUNCTION public.delete_print(p_print_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid := auth.uid(); v_print public.prints;
        v_reservation public.print_reservations; v_spool jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated'; END IF;
  PERFORM private.acquire_owner_mutation_lock(v_user_id);
  SELECT * INTO v_print FROM public.prints WHERE id = p_print_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found'; END IF;
  SELECT * INTO v_reservation FROM public.print_reservations WHERE print_id = p_print_id AND user_id = v_user_id;
  IF FOUND THEN
    UPDATE private.reservation_requests SET state = 'deleted', completed_at = now()
      WHERE user_id = v_user_id AND reservation_id = v_reservation.id;
    DELETE FROM public.print_reservations WHERE id = v_reservation.id;
    SELECT to_jsonb(s) || jsonb_build_object('reserved_grams', i.reserved_grams, 'available_grams', i.available_grams)
      INTO v_spool FROM public.spool_inventory i JOIN public.spools s ON s.id = i.id WHERE i.id = v_reservation.spool_id;
  END IF;
  DELETE FROM public.prints WHERE id = p_print_id AND user_id = v_user_id;
  RETURN jsonb_build_object('id', p_print_id, 'releasedReservationId', v_reservation.id,
    'releasedGrams', v_reservation.reserved_grams, 'spool', v_spool,
    'cancelledReservations', CASE WHEN v_reservation.id IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(jsonb_build_object('reservationId', v_reservation.id,
        'printId', v_print.id, 'printName', v_print.name, 'material', v_print.material,
        'colour', v_print.colour, 'releasedGrams', v_reservation.reserved_grams)) END);
END;
$$;

CREATE FUNCTION public.preview_print_reservation(p_print_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid := auth.uid(); v_print public.prints; v_required numeric; v_eligible jsonb; v_suggested uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated'; END IF;
  SELECT * INTO v_print FROM public.prints WHERE id = p_print_id AND user_id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.print_reservations WHERE print_id = p_print_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'already_reserved';
  END IF;
  v_required := private.calculate_reservation_grams(v_print.required_grams, 10);
  SELECT COALESCE(jsonb_agg(to_jsonb(eligible) ORDER BY eligible.available_grams, eligible.created_at, eligible.id), '[]'::jsonb),
         (jsonb_agg(eligible.id ORDER BY eligible.available_grams, eligible.created_at, eligible.id)->>0)::uuid
    INTO v_eligible, v_suggested
    FROM (
      SELECT s.id, s.user_id, s.material, s.colour, s.colour_key, s.recorded_grams, s.created_at, s.updated_at,
             COALESCE(sum(r.reserved_grams), 0) AS reserved_grams,
             s.recorded_grams - COALESCE(sum(r.reserved_grams), 0) AS available_grams
      FROM public.spools s LEFT JOIN public.print_reservations r ON r.user_id=s.user_id AND r.spool_id=s.id
      WHERE s.user_id=v_user_id AND s.material=v_print.material AND s.colour_key=v_print.colour_key
      GROUP BY s.id
      HAVING s.recorded_grams - COALESCE(sum(r.reserved_grams), 0) >= v_required
    ) eligible;
  RETURN jsonb_build_object('printId', v_print.id, 'expectedVersion', v_print.version,
    'marginPercent', 10, 'reservationGrams', v_required, 'suggestedSpoolId', v_suggested,
    'eligibleSpools', v_eligible);
END;
$$;

CREATE FUNCTION public.reserve_print_material(p_request_id uuid, p_print_id uuid, p_expected_version integer, p_spool_id uuid, p_selection_mode text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid := auth.uid(); v_print public.prints; v_spool public.spools;
        v_existing private.reservation_requests; v_required numeric; v_suggested uuid; v_reservation_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated'; END IF;
  IF p_request_id IS NULL OR p_selection_mode NOT IN ('best_fit', 'manual') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_reservation_request';
  END IF;
  PERFORM private.acquire_owner_mutation_lock(v_user_id);
  SELECT * INTO v_existing FROM private.reservation_requests WHERE user_id=v_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.print_id IS DISTINCT FROM p_print_id OR v_existing.spool_id IS DISTINCT FROM p_spool_id OR v_existing.expected_version IS DISTINCT FROM p_expected_version OR v_existing.selection_mode IS DISTINCT FROM p_selection_mode THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'idempotency_conflict';
    END IF;
    IF v_existing.state <> 'active' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reservation_request_completed'; END IF;
    RETURN jsonb_build_object('reservationId', v_existing.reservation_id, 'disposition', 'active', 'replayed', true);
  END IF;
  SELECT * INTO v_print FROM public.prints WHERE id=p_print_id AND user_id=v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found'; END IF;
  IF v_print.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'edit_conflict'; END IF;
  IF EXISTS (SELECT 1 FROM public.print_reservations WHERE print_id=p_print_id AND user_id=v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'already_reserved';
  END IF;
  v_required := private.calculate_reservation_grams(v_print.required_grams, 10);
  SELECT s.id INTO v_suggested FROM public.spools s
    WHERE s.user_id=v_user_id AND s.material=v_print.material AND s.colour_key=v_print.colour_key
      AND s.recorded_grams - COALESCE((SELECT sum(r.reserved_grams) FROM public.print_reservations r WHERE r.spool_id=s.id AND r.user_id=v_user_id),0) >= v_required
    ORDER BY s.recorded_grams - COALESCE((SELECT sum(r.reserved_grams) FROM public.print_reservations r WHERE r.spool_id=s.id AND r.user_id=v_user_id),0), s.created_at, s.id
    LIMIT 1;
  IF v_suggested IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_material'; END IF;
  IF p_selection_mode='best_fit' AND p_spool_id IS DISTINCT FROM v_suggested THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'selection_stale';
  END IF;
  SELECT * INTO v_spool FROM public.spools s WHERE s.id=p_spool_id AND s.user_id=v_user_id
    AND s.material=v_print.material AND s.colour_key=v_print.colour_key
    AND s.recorded_grams - COALESCE((SELECT sum(r.reserved_grams) FROM public.print_reservations r WHERE r.spool_id=s.id AND r.user_id=v_user_id),0) >= v_required FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_material'; END IF;
  v_reservation_id := gen_random_uuid();
  INSERT INTO public.print_reservations (id,user_id,print_id,spool_id,reserved_grams,margin_percent,selection_mode)
    VALUES (v_reservation_id,v_user_id,p_print_id,p_spool_id,v_required,10,p_selection_mode);
  INSERT INTO private.reservation_requests (user_id,request_id,print_id,spool_id,expected_version,selection_mode,reservation_id,state)
    VALUES (v_user_id,p_request_id,p_print_id,p_spool_id,p_expected_version,p_selection_mode,v_reservation_id,'active');
  UPDATE public.prints SET name=name WHERE id=p_print_id AND user_id=v_user_id;
  RETURN jsonb_build_object('reservationId',v_reservation_id,'disposition','active','replayed',false);
END;
$$;

CREATE FUNCTION public.release_print_material(p_reservation_id uuid, p_print_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid := auth.uid(); v_request private.reservation_requests; v_reservation public.print_reservations;
        v_print jsonb; v_spool jsonb; v_disposition text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authenticated'; END IF;
  PERFORM private.acquire_owner_mutation_lock(v_user_id);
  SELECT * INTO v_request FROM private.reservation_requests
    WHERE user_id=v_user_id AND reservation_id=p_reservation_id AND print_id=p_print_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'not_found'; END IF;
  SELECT * INTO v_reservation FROM public.print_reservations WHERE id=p_reservation_id AND user_id=v_user_id;
  IF FOUND THEN
    DELETE FROM public.print_reservations WHERE id=p_reservation_id AND user_id=v_user_id;
    UPDATE private.reservation_requests SET state='released',completed_at=now()
      WHERE user_id=v_user_id AND reservation_id=p_reservation_id;
    UPDATE public.prints SET name=name WHERE id=v_reservation.print_id AND user_id=v_user_id;
    v_disposition := 'released';
  ELSE
    v_disposition := 'already_released';
  END IF;
  SELECT to_jsonb(p) INTO v_print FROM public.prints p WHERE p.id=v_request.print_id AND p.user_id=v_user_id;
  SELECT to_jsonb(s) || jsonb_build_object('reserved_grams',i.reserved_grams,'available_grams',i.available_grams)
    INTO v_spool FROM public.spool_inventory i JOIN public.spools s ON s.id=i.id WHERE i.id=v_request.spool_id AND i.user_id=v_user_id;
  RETURN jsonb_build_object('reservationId',p_reservation_id,'disposition',v_disposition,'print',v_print,'spool',v_spool);
END;
$$;

REVOKE ALL ON public.spools, public.prints FROM PUBLIC, anon, authenticated;
REVOKE INSERT (user_id, material, colour, recorded_grams), UPDATE (material, colour, recorded_grams), DELETE
  ON public.spools FROM PUBLIC, anon, authenticated;
REVOKE INSERT (user_id, name, material, colour, required_grams), UPDATE (name, material, colour, required_grams), DELETE
  ON public.prints FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.spools, public.prints TO authenticated;
REVOKE ALL ON public.print_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.print_reservations TO authenticated;

REVOKE ALL ON FUNCTION public.create_spool(text,text,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_spool(uuid,text,text,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_spool(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_print(text,text,text,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_print(uuid,integer,text,text,text,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_print(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preview_print_reservation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reserve_print_material(uuid,uuid,integer,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_print_material(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_spool(text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_spool(uuid,text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_spool(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_print(text,text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_print(uuid,integer,text,text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_print(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_print_reservation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_print_material(uuid,uuid,integer,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_print_material(uuid,uuid) TO authenticated;
