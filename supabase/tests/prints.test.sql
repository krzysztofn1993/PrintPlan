BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- Supported writes use the deployed RPCs without changing authenticated privileges.
-- Direct product writes below only test denied access or the generated-column constraint.

SELECT no_plan();

INSERT INTO auth.users (id, email)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'prints-owner-a@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'prints-owner-b@example.test');

-- Seed ordinary product records through the authenticated production boundary.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT set_config('test.print_a', public.create_print('Original print', 'pla', 'Black', 120)->>'id', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT set_config('test.print_b', public.create_print('Owner B print', 'petg', 'Blue', 80)->>'id', true);
RESET ROLE;

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
  (SELECT version FROM public.prints WHERE id = current_setting('test.print_a')::uuid),
  1,
  'new prints start at version 1'
);

SELECT lives_ok(
  $$SELECT public.create_print(NULL, 'pla', 'Black', 80)$$,
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
  $$SELECT public.create_print('  ' || chr(9) || chr(133), 'blank-name', 'White', 1)$$,
  'a blank name is accepted and normalized to null'
);

SELECT is(
  (SELECT name FROM public.prints WHERE material = 'BLANK-NAME'),
  NULL::text,
  'whitespace-only names are stored as null'
);

SELECT lives_ok(
  $$SELECT public.create_print('MiXeD Name', 'case-name', 'White', 1)$$,
  'a named print can be created'
);

SELECT is(
  (SELECT name FROM public.prints WHERE material = 'CASE-NAME'),
  'MiXeD Name',
  'name whitespace is normalized without changing case'
);

SELECT lives_ok(
  $$SELECT public.create_print(
    'Duplicate', 'PLA', 'Black', 15);
    SELECT public.create_print('Duplicate', 'PLA', 'Black', 15
  )$$,
  'identical prints remain separate records'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE name = 'Duplicate' AND material = 'PLA' AND colour = 'Black' AND required_grams = 15),
  2,
  'duplicate print fields are not unique'
);

SELECT lives_ok(
  $$SELECT public.create_print(
    chr(133) || '  Phone' || chr(9) || '  holder  ' || chr(160), chr(133) || ' stra' || U&'\00DFe' || chr(160), chr(65279) || 'Black' || chr(9) || chr(133) || ' / Red / Gold', 80
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
  $$SELECT public.create_print(NULL, 'DOTTED-I', U&'\0130', 1)$$,
  'a dotted capital I colour is accepted'
);

SELECT is(
  (SELECT colour_key FROM public.prints WHERE material = 'DOTTED-I'),
  U&'\0069\0307',
  'ICU colour key maps dotted capital I to i plus combining dot'
);

SELECT lives_ok(
  $$SELECT public.create_print(NULL, 'GREEK-SIGMA', U&'\039F\03A3', 1)$$,
  'a Greek uppercase sigma colour is accepted'
);

SELECT is(
  (SELECT colour_key FROM public.prints WHERE material = 'GREEK-SIGMA'),
  U&'\03BF\03C2',
  'ICU colour key applies contextual final sigma lowercasing'
);

SELECT lives_ok(
  $$SELECT public.create_print(repeat(U&'\+01F600', 80), 'NAME-80', repeat(U&'\+01F600', 80), 1)$$,
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
  $$SELECT public.create_print(repeat(U&'\+01F600', 81), 'NAME-81', 'White', 1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_name_length_check"',
  '81 Unicode code points exceed the name limit'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, 'COLOUR-81', repeat(U&'\+01F600', 81), 1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_colour_length_check"',
  '81 supplementary Unicode code points exceed the colour limit'
);

SELECT lives_ok(
  $$SELECT public.create_print(NULL, repeat(U&'\00DF', 40), 'White', 1)$$,
  '40 sharp-s material code points fit after uppercase expansion'
);

SELECT is(
  (SELECT char_length(material)::integer FROM public.prints WHERE char_length(material) = 80 AND colour = 'White'),
  80,
  'material length is checked after ICU uppercase expansion'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, repeat(U&'\00DF', 41), 'White', 1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_material_length_check"',
  '41 sharp-s material code points fail the limit after uppercase expansion'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, NULL, 'Black', 1)$$,
  '23502',
  'null value in column "material" of relation "prints" violates not-null constraint',
  'null material is rejected'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, 'PLA', NULL, 1)$$,
  '23502',
  'null value in column "colour" of relation "prints" violates not-null constraint',
  'null colour is rejected'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, 'PLA', 'Black', NULL)$$,
  '23502',
  'null value in column "required_grams" of relation "prints" violates not-null constraint',
  'null required grams are rejected'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, '', 'Black', 1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_material_length_check"',
  'blank material is rejected after normalization'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, 'PLA', chr(9) || chr(133), 1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_colour_length_check"',
  'blank colour is rejected after normalization'
);

SELECT lives_ok(
  $$SELECT public.create_print(NULL, 'MINIMUM', 'White', 1)$$,
  'the positive one-gram minimum is accepted'
);

SELECT lives_ok(
  $$SELECT public.create_print(NULL, 'MAXIMUM', 'White', 2147483647)$$,
  'the signed 32-bit integer maximum is accepted'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, 'ZERO', 'White', 0)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'zero required grams are rejected on insert'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, 'NEGATIVE', 'White', -1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'negative required grams are rejected on insert'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, 'FRACTIONAL', 'White', 1.5)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'fractional required grams are rejected without rounding'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, 'TOO-LARGE', 'White', 2147483648)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'required grams above the integer representation limit are rejected'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, 'NAN', 'White', 'NaN'::numeric)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'NaN required grams are rejected'
);

SELECT throws_ok(
  $$SELECT public.create_print(NULL, 'INFINITY', 'White', 'Infinity'::numeric)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'infinite required grams are rejected'
);

SELECT lives_ok(
  $$SELECT public.update_print(current_setting('test.print_a')::uuid, 1, 'Original print', 'PLA', 'Black', 80)$$,
  'owner A can update a print at the version it read'
);

SELECT is(
  (SELECT version FROM public.prints WHERE id = current_setting('test.print_a')::uuid),
  2,
  'a successful update increments version once'
);

SELECT lives_ok(
  $$SELECT public.update_print(current_setting('test.print_a')::uuid, 2, 'Original print', 'PLA', 'Black', 80)$$,
  'an unchanged update is still a successful update'
);

SELECT is(
  (SELECT version FROM public.prints WHERE id = current_setting('test.print_a')::uuid),
  3,
  'a no-op update also increments version once'
);

SELECT throws_ok(
  $$SELECT public.update_print(current_setting('test.print_a')::uuid, 2, 'Original print', 'PLA', 'Black', 100)$$,
  'P0001',
  'edit_conflict',
  'a stale RPC update rejects the old version'
);

SELECT is(
  (SELECT required_grams FROM public.prints WHERE id = current_setting('test.print_a')::uuid),
  80::numeric,
  'a stale RPC update leaves the current requirements unchanged'
);

SELECT lives_ok(
  $$SELECT public.update_print(current_setting('test.print_a')::uuid, 3, 'Original print', 'PLA', 'Black', 1)$$,
  'the one-gram minimum is accepted on update'
);

SELECT lives_ok(
  $$SELECT public.update_print(current_setting('test.print_a')::uuid, 4, 'Original print', 'PLA', 'Black', 2147483647)$$,
  'the integer representation maximum is accepted on update'
);

SELECT throws_ok(
  $$SELECT public.update_print(current_setting('test.print_a')::uuid, 5, 'Original print', 'PLA', 'Black', 0)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'zero required grams are rejected on update'
);

SELECT throws_ok(
  $$SELECT public.update_print(current_setting('test.print_a')::uuid, 5, 'Original print', 'PLA', 'Black', -1)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'negative required grams are rejected on update'
);

SELECT throws_ok(
  $$SELECT public.update_print(current_setting('test.print_a')::uuid, 5, 'Original print', 'PLA', 'Black', 1.5)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'fractional required grams are rejected on update'
);

SELECT throws_ok(
  $$SELECT public.update_print(current_setting('test.print_a')::uuid, 5, 'Original print', 'PLA', 'Black', 2147483648)$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'required grams above the integer representation limit are rejected on update'
);

SELECT throws_ok(
  $$SELECT public.update_print(
    current_setting('test.print_a')::uuid, 5, 'Original print', 'PLA', 'Black', 'NaN'::numeric
  )$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'NaN required grams are rejected on update'
);

SELECT throws_ok(
  $$SELECT public.update_print(
    current_setting('test.print_a')::uuid, 5, 'Original print', 'PLA', 'Black', 'Infinity'::numeric
  )$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'infinite required grams are rejected on update'
);

SELECT is(
  (SELECT version FROM public.prints WHERE id = current_setting('test.print_a')::uuid),
  5,
  'rejected updates do not increment version'
);

SELECT throws_ok(
  $$SELECT public.update_print(current_setting('test.print_a')::uuid, 5, 'Original print', 'PLA', 'Black', NULL)$$,
  '23502',
  'null value in column "required_grams" of relation "prints" violates not-null constraint',
  'null required grams are rejected on update'
);

SELECT lives_ok(
  $$SELECT public.update_print(
    current_setting('test.print_a')::uuid, 5, '  Edited   Name  ', chr(133) || ' petg ' || chr(160), 'Black' || chr(9) || ' / Red / Gold', 2147483647
  )$$,
  'owner A can update editable print fields through database normalization'
);

SELECT is(
  (SELECT name FROM public.prints WHERE id = current_setting('test.print_a')::uuid),
  'Edited Name',
  'updated name whitespace is collapsed while case is preserved'
);

SELECT is(
  (SELECT material FROM public.prints WHERE id = current_setting('test.print_a')::uuid),
  'PETG',
  'updated material is canonical uppercase'
);

SELECT is(
  (SELECT colour FROM public.prints WHERE id = current_setting('test.print_a')::uuid),
  'Black / Red / Gold',
  'updated multicolour display label keeps component order'
);

SELECT is(
  (SELECT colour_key FROM public.prints WHERE id = current_setting('test.print_a')::uuid),
  'black / red / gold',
  'updated colour key is generated from the normalized label'
);

SELECT lives_ok(
  $$SELECT public.update_print(
    current_setting('test.print_a')::uuid, 6, chr(133) || chr(9) || chr(160), 'PETG', 'Black / Red / Gold', 2147483647
  )$$,
  'owner A can clear an optional name with blank input'
);

SELECT is(
  (SELECT name FROM public.prints WHERE id = current_setting('test.print_a')::uuid),
  NULL::text,
  'a cleared name is stored as null'
);

SELECT throws_ok(
  $$SELECT public.update_print(
    current_setting('test.print_a')::uuid, 7, repeat(U&'\+01F600', 81), 'PETG', 'Black / Red / Gold', 2147483647
  )$$,
  '23514',
  'new row for relation "prints" violates check constraint "prints_name_length_check"',
  '81 Unicode code points exceed the name limit on update'
);

SELECT is(
  (SELECT version FROM public.prints WHERE id = current_setting('test.print_a')::uuid),
  7,
  'failed null and overlong-name updates do not change the version'
);

SELECT throws_ok(
  $$UPDATE public.prints SET id = '20000000-0000-0000-0000-000000000003'
    WHERE id = current_setting('test.print_a')::uuid$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot change a print ID'
);

SELECT throws_ok(
  $$UPDATE public.prints SET user_id = '00000000-0000-0000-0000-000000000002'
    WHERE id = current_setting('test.print_a')::uuid$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot reassign print ownership'
);

SELECT throws_ok(
  $$UPDATE public.prints SET created_at = now()
    WHERE id = current_setting('test.print_a')::uuid$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot change print creation time'
);

SELECT throws_ok(
  $$UPDATE public.prints SET updated_at = now()
    WHERE id = current_setting('test.print_a')::uuid$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot choose print update time'
);

SELECT throws_ok(
  $$UPDATE public.prints SET version = 99
    WHERE id = current_setting('test.print_a')::uuid$$,
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

-- Exercise the generated-column constraint independently of application privileges.
RESET ROLE;
SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, colour_key, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', 'forged', 1)$$,
  '428C9',
  'cannot insert a non-DEFAULT value into column "colour_key"',
  'the database rejects a supplied derived colour key'
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$INSERT INTO public.prints (user_id, material, colour, required_grams)
    VALUES ('00000000-0000-0000-0000-000000000002', 'PLA', 'Black', 1)$$,
  '42501',
  'permission denied for table prints',
  'owner A cannot forge owner B on insert'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE id = current_setting('test.print_a')::uuid),
  1,
  'the original print identity remains unchanged after blocked reassignment'
);

SELECT lives_ok(
  $$SELECT public.create_print(NULL, 'DELETE-ME', 'White', 1)$$,
  'owner A can create a print for deletion'
);

SELECT lives_ok(
  $$SELECT public.delete_print((SELECT id FROM public.prints WHERE material = 'DELETE-ME'))$$,
  'owner A can delete their own print'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints WHERE material = 'DELETE-ME'),
  0,
  'owner A no longer reads their deleted print'
);

SELECT throws_ok(
  $$SELECT public.update_print(current_setting('test.print_b')::uuid, 1, 'Owner B print', 'PETG', 'Blue', 1)$$,
  'P0002',
  'not_found',
  'owner A update of owner B print returns not_found without exposing the row'
);

SELECT throws_ok(
  $$SELECT public.delete_print(current_setting('test.print_b')::uuid)$$,
  'P0002',
  'not_found',
  'owner A delete of owner B print returns not_found without exposing the row'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE id = current_setting('test.print_b')::uuid),
  0,
  'owner A cannot read owner B print'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

SELECT is(
  (SELECT count(*)::integer FROM public.prints),
  1,
  'owner B reads only their own print'
);

SELECT throws_ok(
  $$SELECT public.update_print(current_setting('test.print_a')::uuid, 7, NULL, 'PETG', 'Black / Red / Gold', 1)$$,
  'P0002',
  'not_found',
  'owner B update of owner A print returns not_found without exposing the row'
);

SELECT throws_ok(
  $$SELECT public.delete_print(current_setting('test.print_a')::uuid)$$,
  'P0002',
  'not_found',
  'owner B delete of owner A print returns not_found without exposing the row'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE id = current_setting('test.print_a')::uuid),
  0,
  'owner B cannot read owner A print after update and delete attempts'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE id = current_setting('test.print_a')::uuid
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
    WHERE id = current_setting('test.print_b')::uuid),
  80::numeric,
  'owner B print remains unchanged'
);

SELECT lives_ok(
  $$SELECT public.delete_print(current_setting('test.print_b')::uuid)$$,
  'owner B can delete their own print'
);

SELECT is(
  (SELECT count(*)::integer FROM public.prints
    WHERE id = current_setting('test.print_b')::uuid),
  0,
  'deleted print is no longer visible to its owner'
);

-- The shared text contract preserves non-whitespace and combining marks without composition.
SELECT public.create_print(input, 'LABEL-BOUNDARY-' || suffix, input, 1)
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

SELECT public.create_print('Before Unicode edit', 'LABEL-EDIT-BOUNDARY-' || suffix, 'Before Unicode edit', 1)
FROM generate_series(1, 6) AS fixture(suffix);

WITH changed AS (
SELECT public.update_print(record.id, record.version, fixture.input, record.material, fixture.input, record.required_grams) AS receipt
FROM public.prints AS record
JOIN (VALUES
    ('1', U&'\200BBlack\200B', U&'\200BBlack\200B'),
    ('2', U&'\2060Black\2060', U&'\2060Black\2060'),
    ('3', U&'\180EBlack\180E', U&'\180EBlack\180E'),
    ('4', U&'e\0301', U&'e\0301'),
    ('5', U&'\00E9', U&'\00E9'),
    ('6', U&' \0009\200BBlack\0085\00A0Red\200B \0009', U&'\200BBlack Red\200B')
) AS fixture(suffix, input, expected)
  ON record.material = 'LABEL-EDIT-BOUNDARY-' || fixture.suffix
)
SELECT is(
  (SELECT count(receipt->>'id')::integer FROM changed),
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
