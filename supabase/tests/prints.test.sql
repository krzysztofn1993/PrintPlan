BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT no_plan();

INSERT INTO auth.users (id, email)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'prints-owner-a@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'prints-owner-b@example.test');

INSERT INTO public.prints (id, user_id, name, material, colour, required_grams)
VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Original print',
    'pla',
    'Black',
    120
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Owner B print',
    'petg',
    'Blue',
    80
  );

SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT id FROM public.prints$$,
  '42501',
  'permission denied for table prints',
  'anonymous role cannot read prints'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', 1)$$,
  '42501',
  'permission denied for table prints',
  'anonymous role cannot insert prints'
);

SELECT throws_ok(
  $$UPDATE public.prints SET required_grams = 1$$,
  '42501',
  'permission denied for table prints',
  'anonymous role cannot update prints'
);

SELECT throws_ok(
  $$DELETE FROM public.prints$$,
  '42501',
  'permission denied for table prints',
  'anonymous role cannot delete prints'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.prints),
  1,
  'owner A reads only their own print'
);

SELECT is(
  (SELECT version FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'),
  1,
  'new prints start at version 1'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'pla', 'Black', 80)$$,
  'owner A can create a print without a name'
);

SELECT is(
  (SELECT name FROM public.prints WHERE material = 'PLA' AND colour = 'Black' AND required_grams = 80),
  NULL::text,
  'an omitted name is stored as null'
);

SELECT is(
  (SELECT version FROM public.prints WHERE material = 'PLA' AND colour = 'Black' AND required_grams = 80),
  1,
  'an inserted print uses the database-managed default version'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, name, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', '  ' || chr(9) || chr(133), 'blank-name', 'White', 1)$$,
  'a blank name is accepted and normalized to null'
);

SELECT is(
  (SELECT name FROM public.prints WHERE material = 'BLANK-NAME'),
  NULL::text,
  'whitespace-only names are stored as null'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, name, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'MiXeD Name', 'case-name', 'White', 1)$$,
  'a named print can be created'
);

SELECT is(
  (SELECT name FROM public.prints WHERE material = 'CASE-NAME'),
  'MiXeD Name',
  'name whitespace is normalized without changing case'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, name, material, colour, required_grams)
    VALUES
      ('00000000-0000-0000-0000-000000000001', 'Duplicate', 'PLA', 'Black', 15),
      ('00000000-0000-0000-0000-000000000001', 'Duplicate', 'PLA', 'Black', 15)$$,
  'identical prints remain separate records'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE name = 'Duplicate' AND material = 'PLA' AND colour = 'Black' AND required_grams = 15),
  2,
  'duplicate print fields are not unique'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, name, material, colour, required_grams)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      chr(133) || '  Phone' || chr(9) || '  holder  ' || chr(160),
      chr(133) || ' stra' || U&'\00DFe' || chr(160),
      chr(65279) || 'Black' || chr(9) || chr(133) || ' / Red / Gold',
      80
    )$$,
  'listed Unicode whitespace and material case are normalized'
);

SELECT is(
  (SELECT name FROM public.prints WHERE material = 'STRASSE' AND colour = 'Black / Red / Gold'),
  'Phone holder',
  'the optional name collapses explicit whitespace runs and trims edges'
);

SELECT is(
  (SELECT material FROM public.prints WHERE colour = 'Black / Red / Gold'),
  'STRASSE',
  'material uses ICU uppercase, including sharp-s expansion'
);

SELECT is(
  (SELECT colour FROM public.prints WHERE material = 'STRASSE'),
  'Black / Red / Gold',
  'colour display case and multicolour component order are preserved'
);

SELECT is(
  (SELECT colour_key FROM public.prints WHERE material = 'STRASSE'),
  'black / red / gold',
  'the generated colour key lowercases the normalized whole label'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'DOTTED-I', U&'\0130', 1)$$,
  'a dotted capital I colour is accepted'
);

SELECT is(
  (SELECT colour_key FROM public.prints WHERE material = 'DOTTED-I'),
  U&'\0069\0307',
  'ICU colour key maps dotted capital I to i plus combining dot'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'GREEK-SIGMA', U&'\039F\03A3', 1)$$,
  'a Greek uppercase sigma colour is accepted'
);

SELECT is(
  (SELECT colour_key FROM public.prints WHERE material = 'GREEK-SIGMA'),
  U&'\03BF\03C2',
  'ICU colour key applies contextual final sigma lowercasing'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, name, material, colour, required_grams)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      repeat(U&'\+01F600', 80),
      'NAME-80',
      repeat(U&'\+01F600', 80),
      1
    )$$,
  '80 supplementary Unicode code points fit name and colour limits'
);

SELECT is(
  (SELECT char_length(name)::integer FROM public.prints WHERE material = 'NAME-80'),
  80,
  'name length counts Unicode code points'
);

SELECT is(
  (SELECT char_length(colour)::integer FROM public.prints WHERE material = 'NAME-80'),
  80,
  'colour length counts Unicode code points'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, name, material, colour, required_grams)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      repeat(U&'\+01F600', 81),
      'NAME-81',
      'White',
      1
    )$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_name_length_check"',
  '81 Unicode code points exceed the name limit'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'COLOUR-81', repeat(U&'\+01F600', 81), 1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_colour_length_check"',
  '81 supplementary Unicode code points exceed the colour limit'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', repeat(U&'\00DF', 40), 'White', 1)$$,
  '40 sharp-s material code points fit after uppercase expansion'
);

SELECT is(
  (SELECT char_length(material)::integer FROM public.prints WHERE char_length(material) = 80 AND colour = 'White'),
  80,
  'material length is checked after ICU uppercase expansion'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', repeat(U&'\00DF', 41), 'White', 1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_material_length_check"',
  '41 sharp-s material code points fail the limit after uppercase expansion'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', NULL, 'Black', 1)$$,
  '23502',
  'null value in column "material" of relation "prints" violates not-null constraint',
  'null material is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', NULL, 1)$$,
  '23502',
  'null value in column "colour" of relation "prints" violates not-null constraint',
  'null colour is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', NULL)$$,
  '23502',
  'null value in column "required_grams" of relation "prints" violates not-null constraint',
  'null required grams are rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', '', 'Black', 1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_material_length_check"',
  'blank material is rejected after normalization'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', chr(9) || chr(133), 1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_colour_length_check"',
  'blank colour is rejected after normalization'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'MINIMUM', 'White', 1)$$,
  'the positive one-gram minimum is accepted'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'MAXIMUM', 'White', 2147483647)$$,
  'the signed 32-bit integer maximum is accepted'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'ZERO', 'White', 0)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'zero required grams are rejected on insert'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'NEGATIVE', 'White', -1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'negative required grams are rejected on insert'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'FRACTIONAL', 'White', 1.5)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'fractional required grams are rejected without rounding'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'TOO-LARGE', 'White', 2147483648)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'required grams above the integer representation limit are rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'NAN', 'White', 'NaN'::numeric)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'NaN required grams are rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'INFINITY', 'White', 'Infinity'::numeric)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'infinite required grams are rejected'
);

SELECT lives_ok(
  $$UPDATE public.prints SET required_grams = 80
    WHERE id = '20000000-0000-0000-0000-000000000001' AND version = 1$$,
  'owner A can update a print at the version it read'
);

SELECT is(
  (SELECT version FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'),
  2,
  'a successful update increments version once'
);

SELECT lives_ok(
  $$UPDATE public.prints SET required_grams = required_grams
    WHERE id = '20000000-0000-0000-0000-000000000001' AND version = 2$$,
  'an unchanged update is still a successful update'
);

SELECT is(
  (SELECT version FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'),
  3,
  'a no-op update also increments version once'
);

WITH changed AS (
  UPDATE public.prints SET required_grams = 100
  WHERE id = '20000000-0000-0000-0000-000000000001' AND version = 2
  RETURNING id
)
SELECT is(
  (SELECT count(*)::integer FROM changed),
  0,
  'a stale conditional update affects zero rows'
);

SELECT is(
  (SELECT required_grams FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'),
  80::numeric,
  'a stale conditional update leaves the current requirements unchanged'
);

SELECT lives_ok(
  $$UPDATE public.prints SET required_grams = 1
    WHERE id = '20000000-0000-0000-0000-000000000001' AND version = 3$$,
  'the one-gram minimum is accepted on update'
);

SELECT lives_ok(
  $$UPDATE public.prints SET required_grams = 2147483647
    WHERE id = '20000000-0000-0000-0000-000000000001' AND version = 4$$,
  'the integer representation maximum is accepted on update'
);

SELECT throws_ok(
  $$UPDATE public.prints SET required_grams = 0
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'zero required grams are rejected on update'
);

SELECT throws_ok(
  $$UPDATE public.prints SET required_grams = -1
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'negative required grams are rejected on update'
);

SELECT throws_ok(
  $$UPDATE public.prints SET required_grams = 1.5
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'fractional required grams are rejected on update'
);

SELECT throws_ok(
  $$UPDATE public.prints SET required_grams = 2147483648
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'required grams above the integer representation limit are rejected on update'
);

SELECT throws_ok(
  $$UPDATE public.prints SET required_grams = 'NaN'::numeric
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'NaN required grams are rejected on update'
);

SELECT throws_ok(
  $$UPDATE public.prints SET required_grams = 'Infinity'::numeric
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'infinite required grams are rejected on update'
);

SELECT is(
  (SELECT version FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'),
  5,
  'rejected updates do not increment version'
);

SELECT throws_ok(
  $$UPDATE public.prints SET required_grams = NULL
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23502',
  'null value in column "required_grams" of relation "prints" violates not-null constraint',
  'null required grams are rejected on update'
);

SELECT lives_ok(
  $$UPDATE public.prints
    SET name = '  Edited   Name  ',
        material = chr(133) || ' petg ' || chr(160),
        colour = 'Black' || chr(9) || ' / Red / Gold'
    WHERE id = '20000000-0000-0000-0000-000000000001' AND version = 5$$,
  'owner A can update editable print fields through database normalization'
);

SELECT is(
  (SELECT name FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'),
  'Edited Name',
  'updated name whitespace is collapsed while case is preserved'
);

SELECT is(
  (SELECT material FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'),
  'PETG',
  'updated material is canonical uppercase'
);

SELECT is(
  (SELECT colour FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'),
  'Black / Red / Gold',
  'updated multicolour display label keeps component order'
);

SELECT is(
  (SELECT colour_key FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'),
  'black / red / gold',
  'updated colour key is generated from the normalized label'
);

SELECT lives_ok(
  $$UPDATE public.prints SET name = chr(133) || chr(9) || chr(160)
    WHERE id = '20000000-0000-0000-0000-000000000001' AND version = 6$$,
  'owner A can clear an optional name with blank input'
);

SELECT is(
  (SELECT name FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'),
  NULL::text,
  'a cleared name is stored as null'
);

SELECT throws_ok(
  $$UPDATE public.prints SET name = repeat(U&'\+01F600', 81)
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_name_length_check"',
  '81 Unicode code points exceed the name limit on update'
);

SELECT is(
  (SELECT version FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'),
  7,
  'failed null and overlong-name updates do not change the version'
);

SELECT throws_ok(
  $$UPDATE public.prints SET id = '20000000-0000-0000-0000-000000000003'
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot change a print ID'
);

SELECT throws_ok(
  $$UPDATE public.prints SET user_id = '00000000-0000-0000-0000-000000000002'
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot reassign print ownership'
);

SELECT throws_ok(
  $$UPDATE public.prints SET created_at = now()
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot change print creation time'
);

SELECT throws_ok(
  $$UPDATE public.prints SET updated_at = now()
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot choose print update time'
);

SELECT throws_ok(
  $$UPDATE public.prints SET version = 99
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot reassign print version'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (id, user_id, material, colour, required_grams)
    VALUES (
      '20000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000001',
      'PLA',
      'Black',
      1
    )$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot choose a print ID on insert'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, name, material, colour, required_grams, version)
    VALUES ('00000000-0000-0000-0000-000000000001', NULL, 'PLA', 'Black', 1, 99)$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot choose a print version on insert'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, name, material, colour, required_grams, created_at, updated_at)
    VALUES ('00000000-0000-0000-0000-000000000001', NULL, 'PLA', 'Black', 1, now(), now())$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot choose print timestamps on insert'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, colour_key, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', 'forged', 1)$$,
  '428C9',
  'cannot insert a non-DEFAULT value into column "colour_key"',
  'owner A cannot supply a derived colour key'
);

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000002', 'PLA', 'Black', 1)$$,
  '42501',
  'new row violates row-level security policy for table "prints"',
  'owner A cannot forge owner B on insert'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE id = '20000000-0000-0000-0000-000000000001'),
  1,
  'the original print identity remains unchanged after blocked reassignment'
);

SELECT lives_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'DELETE-ME', 'White', 1)$$,
  'owner A can create a print for deletion'
);

SELECT lives_ok(
  $$DELETE FROM public.prints WHERE material = 'DELETE-ME'$$,
  'owner A can delete their own print'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints WHERE material = 'DELETE-ME'),
  0,
  'owner A no longer reads their deleted print'
);

SELECT lives_ok(
  $$UPDATE public.prints SET required_grams = 1
    WHERE id = '20000000-0000-0000-0000-000000000002'$$,
  'owner A update of owner B print completes without exposing the row'
);

SELECT lives_ok(
  $$DELETE FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000002'$$,
  'owner A delete of owner B print completes without exposing the row'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE id = '20000000-0000-0000-0000-000000000002'),
  0,
  'owner A cannot read owner B print'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

SELECT is(
  (SELECT count(*)::integer FROM public.prints),
  1,
  'owner B reads only their own print'
);

SELECT lives_ok(
  $$UPDATE public.prints SET required_grams = 1
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  'owner B update of owner A print completes without exposing the row'
);

SELECT lives_ok(
  $$DELETE FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  'owner B delete of owner A print completes without exposing the row'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE id = '20000000-0000-0000-0000-000000000001'),
  0,
  'owner B cannot read owner A print after update and delete attempts'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE id = '20000000-0000-0000-0000-000000000001'
      AND name IS NULL
      AND material = 'PETG'
      AND colour = 'Black / Red / Gold'
      AND required_grams = 2147483647
      AND version = 7),
  1,
  'owner A print values and version remain unchanged after owner B attempts'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

SELECT is(
  (SELECT required_grams FROM public.prints
    WHERE id = '20000000-0000-0000-0000-000000000002'),
  80::numeric,
  'owner B print remains unchanged'
);

SELECT lives_ok(
  $$DELETE FROM public.prints WHERE id = '20000000-0000-0000-0000-000000000002'$$,
  'owner B can delete their own print'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE id = '20000000-0000-0000-0000-000000000002'),
  0,
  'deleted print is no longer visible to its owner'
);

-- The shared text contract preserves non-whitespace and combining marks without composition.
INSERT INTO public.prints (user_id, name, material, colour, required_grams)
SELECT auth.uid(), input, 'LABEL-BOUNDARY-' || suffix, input, 1
FROM (VALUES
    ('1', U&'\200BBlack\200B', U&'\200BBlack\200B'),
    ('2', U&'\2060Black\2060', U&'\2060Black\2060'),
    ('3', U&'\180EBlack\180E', U&'\180EBlack\180E'),
    ('4', U&'e\0301', U&'e\0301'),
    ('5', U&'\00E9', U&'\00E9'),
    ('6', U&' \0009\200BBlack\0085\00A0Red\200B \0009', U&'\200BBlack Red\200B')
) AS fixture(suffix, input, expected);

SELECT is(
  (SELECT convert_to(colour, 'UTF8') FROM public.prints WHERE material = 'LABEL-BOUNDARY-' || fixture.suffix),
  convert_to(fixture.expected, 'UTF8'),
  'prints insert preserves exact colour bytes for fixture ' || fixture.suffix
)
FROM (VALUES
    ('1', U&'\200BBlack\200B', U&'\200BBlack\200B'),
    ('2', U&'\2060Black\2060', U&'\2060Black\2060'),
    ('3', U&'\180EBlack\180E', U&'\180EBlack\180E'),
    ('4', U&'e\0301', U&'e\0301'),
    ('5', U&'\00E9', U&'\00E9'),
    ('6', U&' \0009\200BBlack\0085\00A0Red\200B \0009', U&'\200BBlack Red\200B')
) AS fixture(suffix, input, expected);

SELECT is(
  (SELECT convert_to(name, 'UTF8') FROM public.prints WHERE material = 'LABEL-BOUNDARY-' || fixture.suffix),
  convert_to(fixture.expected, 'UTF8'),
  'prints insert preserves exact name bytes for fixture ' || fixture.suffix
)
FROM (VALUES
    ('1', U&'\200BBlack\200B', U&'\200BBlack\200B'),
    ('2', U&'\2060Black\2060', U&'\2060Black\2060'),
    ('3', U&'\180EBlack\180E', U&'\180EBlack\180E'),
    ('4', U&'e\0301', U&'e\0301'),
    ('5', U&'\00E9', U&'\00E9'),
    ('6', U&' \0009\200BBlack\0085\00A0Red\200B \0009', U&'\200BBlack Red\200B')
) AS fixture(suffix, input, expected);

INSERT INTO public.prints (user_id, material, colour, required_grams, name)
SELECT auth.uid(), 'LABEL-EDIT-BOUNDARY-' || suffix, 'Before Unicode edit', 1, 'Before Unicode edit'
FROM generate_series(1, 6) AS fixture(suffix);

WITH changed AS (
UPDATE public.prints AS record
SET colour = fixture.input, name = fixture.input
FROM (VALUES
    ('1', U&'\200BBlack\200B', U&'\200BBlack\200B'),
    ('2', U&'\2060Black\2060', U&'\2060Black\2060'),
    ('3', U&'\180EBlack\180E', U&'\180EBlack\180E'),
    ('4', U&'e\0301', U&'e\0301'),
    ('5', U&'\00E9', U&'\00E9'),
    ('6', U&' \0009\200BBlack\0085\00A0Red\200B \0009', U&'\200BBlack Red\200B')
) AS fixture(suffix, input, expected)
WHERE record.material = 'LABEL-EDIT-BOUNDARY-' || fixture.suffix
RETURNING record.id
)
SELECT is(
  (SELECT count(*)::integer FROM changed),
  6,
  'Unicode edits affect all six independently seeded rows'
);
SELECT is(
  (SELECT convert_to(colour, 'UTF8') FROM public.prints WHERE material = 'LABEL-EDIT-BOUNDARY-' || fixture.suffix),
  convert_to(fixture.expected, 'UTF8'),
  'prints update preserves exact colour bytes for fixture ' || fixture.suffix
)
FROM (VALUES
    ('1', U&'\200BBlack\200B', U&'\200BBlack\200B'),
    ('2', U&'\2060Black\2060', U&'\2060Black\2060'),
    ('3', U&'\180EBlack\180E', U&'\180EBlack\180E'),
    ('4', U&'e\0301', U&'e\0301'),
    ('5', U&'\00E9', U&'\00E9'),
    ('6', U&' \0009\200BBlack\0085\00A0Red\200B \0009', U&'\200BBlack Red\200B')
) AS fixture(suffix, input, expected);

SELECT is(
  (SELECT convert_to(name, 'UTF8') FROM public.prints WHERE material = 'LABEL-EDIT-BOUNDARY-' || fixture.suffix),
  convert_to(fixture.expected, 'UTF8'),
  'prints update preserves exact name bytes for fixture ' || fixture.suffix
)
FROM (VALUES
    ('1', U&'\200BBlack\200B', U&'\200BBlack\200B'),
    ('2', U&'\2060Black\2060', U&'\2060Black\2060'),
    ('3', U&'\180EBlack\180E', U&'\180EBlack\180E'),
    ('4', U&'e\0301', U&'e\0301'),
    ('5', U&'\00E9', U&'\00E9'),
    ('6', U&' \0009\200BBlack\0085\00A0Red\200B \0009', U&'\200BBlack Red\200B')
) AS fixture(suffix, input, expected);

SELECT is(
  (SELECT count(*)::integer FROM public.prints WHERE material LIKE 'LABEL-EDIT-BOUNDARY-%' AND version = 2),
  6,
  'each Unicode edit advances the committed print version once'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
