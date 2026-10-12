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

CREATE TABLE public.prints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text,
  material text NOT NULL,
  colour text NOT NULL,
  colour_key text GENERATED ALWAYS AS (lower(colour COLLATE "und-x-icu")) STORED NOT NULL,
  required_grams numeric NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prints_name_length_check CHECK (
    name IS NULL OR char_length(name) BETWEEN 1 AND 80
  ),
  CONSTRAINT prints_material_length_check CHECK (char_length(material) BETWEEN 1 AND 80),
  CONSTRAINT prints_colour_length_check CHECK (char_length(colour) BETWEEN 1 AND 80),
  CONSTRAINT prints_required_grams_valid CHECK (
    required_grams >= 1
    AND required_grams <= 2147483647
    AND trunc(required_grams) = required_grams
  ),
  CONSTRAINT prints_version_positive CHECK (version > 0)
);

CREATE FUNCTION public.normalize_print_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.name IS NOT NULL THEN
    NEW.name := NULLIF(
      btrim(
        regexp_replace(
          NEW.name COLLATE "C",
          U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+' COLLATE "C",
          ' ',
          'g'
        ),
        ' '
      ),
      ''
    );
  END IF;

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

  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
    NEW.created_at := now();
    NEW.updated_at := NEW.created_at;
  ELSE
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER prints_normalize_before_write
BEFORE INSERT OR UPDATE ON public.prints
FOR EACH ROW
EXECUTE FUNCTION public.normalize_print_before_write();

CREATE INDEX prints_user_created_id_idx
  ON public.prints (user_id, created_at DESC, id ASC);

ALTER TABLE public.prints ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.prints FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.prints TO authenticated;
GRANT INSERT (user_id, name, material, colour, required_grams) ON TABLE public.prints TO authenticated;
GRANT UPDATE (name, material, colour, required_grams) ON TABLE public.prints TO authenticated;

CREATE POLICY prints_select_own
  ON public.prints
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY prints_insert_own
  ON public.prints
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY prints_update_own
  ON public.prints
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY prints_delete_own
  ON public.prints
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
