DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_collation
    WHERE collname = 'und-x-icu'
      AND collprovider = 'i'
  ) THEN
    RAISE EXCEPTION 'Required ICU root collation "und-x-icu" is not available';
  END IF;
END;
$$;

CREATE TABLE public.spools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  material text NOT NULL,
  colour text NOT NULL,
  colour_key text GENERATED ALWAYS AS (lower(colour COLLATE "und-x-icu")) STORED NOT NULL,
  recorded_grams numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spools_material_length_check CHECK (char_length(material) BETWEEN 1 AND 80),
  CONSTRAINT spools_colour_length_check CHECK (char_length(colour) BETWEEN 1 AND 80),
  CONSTRAINT spools_recorded_grams_valid CHECK (
    recorded_grams >= 0
    AND recorded_grams <= 2147483647
    AND trunc(recorded_grams) = recorded_grams
  )
);

CREATE FUNCTION public.normalize_spool_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.material := upper(
    btrim(
      regexp_replace(
        NEW.material COLLATE "C",
        U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+' COLLATE "C",
        ' ',
        'g'
      ),
      ' '
    ) COLLATE "und-x-icu"
  );
  NEW.colour := btrim(
    regexp_replace(
      NEW.colour COLLATE "C",
      U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+' COLLATE "C",
      ' ',
      'g'
    ),
    ' '
  );

  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER spools_normalize_before_write
BEFORE INSERT OR UPDATE ON public.spools
FOR EACH ROW
EXECUTE FUNCTION public.normalize_spool_before_write();

CREATE INDEX spools_user_created_id_idx
  ON public.spools (user_id, created_at DESC, id ASC);

ALTER TABLE public.spools ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.spools FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.spools TO authenticated;
GRANT INSERT (user_id, material, colour, recorded_grams) ON TABLE public.spools TO authenticated;
GRANT UPDATE (material, colour, recorded_grams) ON TABLE public.spools TO authenticated;

CREATE POLICY spools_select_own
  ON public.spools
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY spools_insert_own_positive
  ON public.spools
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND recorded_grams > 0);

CREATE POLICY spools_update_own
  ON public.spools
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY spools_delete_own
  ON public.spools
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
