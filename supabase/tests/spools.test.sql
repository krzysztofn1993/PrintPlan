BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT no_plan();

INSERT INTO auth.users (id, email)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'spools-owner-a@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'spools-owner-b@example.test');

INSERT INTO public.spools (id, user_id, material, colour, recorded_grams)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'pla',
    'Black',
    120
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'petg',
    'Blue',
    80
  );

SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT id FROM public.spools$$,
  '42501',
  'permission denied for table spools',
  'anonymous role cannot read spools'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Anonymous Insert', 1)$$,
  '42501',
  'permission denied for table spools',
  'anonymous role cannot insert spools'
);

SELECT throws_ok(
  $$UPDATE public.spools SET recorded_grams = 1$$,
  '42501',
  'permission denied for table spools',
  'anonymous role cannot update spools'
);

SELECT throws_ok(
  $$DELETE FROM public.spools$$,
  '42501',
  'permission denied for table spools',
  'anonymous role cannot delete spools'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.spools),
  1,
  'owner A can read their own spool'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'pla', 'Black', 150)$$,
  'owner A can insert a positive spool'
);

SELECT is(
  (SELECT material FROM public.spools WHERE user_id = auth.uid() AND colour = 'Black' LIMIT 1),
  'PLA',
  'material is normalized to uppercase'
);

SELECT lives_ok(
  $$UPDATE public.spools
    SET material = ' petg ', colour = 'Black', recorded_grams = 0
    WHERE user_id = auth.uid() AND material = 'PLA' AND recorded_grams = 150$$,
  'owner A can correct a spool to zero grams'
);

SELECT is(
  (SELECT count(*)::integer FROM public.spools
    WHERE user_id = auth.uid() AND material = 'PETG' AND recorded_grams = 0),
  1,
  'an edit to zero keeps the spool and stores canonical material'
);

SELECT lives_ok(
  $$DELETE FROM public.spools
    WHERE user_id = auth.uid() AND material = 'PETG' AND recorded_grams = 0$$,
  'owner A can delete their own spool'
);

SELECT is(
  (SELECT count(*)::integer FROM public.spools
    WHERE user_id = auth.uid() AND material = 'PETG' AND recorded_grams = 0),
  0,
  'deleted spool is no longer visible to its owner'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000002', 'pla', 'Black', 10)$$,
  '42501',
  'new row violates row-level security policy for table "spools"',
  'owner A cannot forge owner B on insert'
);

SELECT throws_ok(
  $$UPDATE public.spools SET user_id = '00000000-0000-0000-0000-000000000002'
    WHERE id = '10000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table spools',
  'owner A cannot reassign a spool'
);

SELECT throws_ok(
  $$UPDATE public.spools SET id = '10000000-0000-0000-0000-000000000003'
    WHERE id = '10000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table spools',
  'owner A cannot change a spool ID'
);

SELECT throws_ok(
  $$UPDATE public.spools SET created_at = now()
    WHERE id = '10000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table spools',
  'owner A cannot change spool creation time'
);

SELECT throws_ok(
  $$UPDATE public.spools SET updated_at = now()
    WHERE id = '10000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table spools',
  'owner A cannot choose spool update time'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (id, user_id, material, colour, recorded_grams)
    VALUES (
      '10000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000001',
      'PLA',
      'Black',
      10
    )$$,
  '42501',
  'permission denied for table spools',
  'owner A cannot choose a spool ID on insert'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams, created_at, updated_at)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'PLA',
      'Black',
      10,
      now(),
      now()
    )$$,
  '42501',
  'permission denied for table spools',
  'owner A cannot choose spool timestamps on insert'
);

SELECT is(
  (SELECT count(*)::integer FROM public.spools WHERE colour_key = 'black'),
  1,
  'colour keys are derived and readable for the owner'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, colour_key, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'pla', 'Black', 'forged', 10)$$,
  '428C9',
  'cannot insert a non-DEFAULT value into column "colour_key"',
  'owner A cannot write a derived colour key'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'pla', 'Black', 0)$$,
  '42501',
  'new row violates row-level security policy for table "spools"',
  'owner A cannot create a zero-gram spool'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES
      ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', 15),
      ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', 15)$$,
  'duplicate spools remain separate records'
);

SELECT is(
  (SELECT count(*)::integer FROM public.spools
    WHERE user_id = auth.uid() AND material = 'PLA' AND colour = 'Black' AND recorded_grams = 15),
  2,
  'identical material, colour, and stock values are allowed'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', chr(133) || ' pla ' || chr(160), chr(65279) || 'Black', 1)$$,
  'listed whitespace at the edges is normalized in material and colour'
);

SELECT is(
  (SELECT material FROM public.spools WHERE user_id = auth.uid() AND colour = 'Black' AND recorded_grams = 1),
  'PLA',
  'material normalization trims and collapses the explicit whitespace set'
);

SELECT is(
  (SELECT colour_key FROM public.spools WHERE user_id = auth.uid() AND colour = 'Black' AND recorded_grams = 1),
  'black',
  'U+FEFF is removed from the beginning of a colour label'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'NEL', chr(133) || 'Black', 1)$$,
  'U+0085 is normalized at the beginning of a colour label'
);

SELECT is(
  (SELECT colour_key FROM public.spools WHERE user_id = auth.uid() AND material = 'NEL'),
  'black',
  'U+0085 colour prefix has the expected key'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'NBSP', chr(160) || 'Black', 1)$$,
  'U+00A0 is normalized at the beginning of a colour label'
);

SELECT is(
  (SELECT colour_key FROM public.spools WHERE user_id = auth.uid() AND material = 'NBSP'),
  'black',
  'U+00A0 colour prefix has the expected key'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'MIXEDSPACE', 'Black' || chr(9) || chr(133) || 'Red', 1)$$,
  'mixed tab and U+0085 whitespace is accepted'
);

SELECT is(
  (SELECT colour FROM public.spools WHERE user_id = auth.uid() AND material = 'MIXEDSPACE'),
  'Black Red',
  'mixed whitespace runs normalize to one ASCII space'
);

SELECT is(
  (SELECT colour_key FROM public.spools WHERE user_id = auth.uid() AND material = 'MIXEDSPACE'),
  'black red',
  'mixed whitespace colour key uses normalized lowercase text'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'PLA',
      chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) || chr(133) || chr(160) ||
        chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) ||
        chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) ||
        chr(8239) || chr(8287) || chr(12288) || chr(65279),
      1
    )$$,
  '23514',
  'new row for relation "spools" violates check constraint "spools_colour_length_check"',
  'a colour consisting only of the explicit whitespace set is rejected'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', U&'Stra\00DFe', 'White', 1)$$,
  'material case conversion accepts the German sharp s fixture'
);

SELECT is(
  (SELECT material FROM public.spools WHERE user_id = auth.uid() AND colour = 'White' AND recorded_grams = 1),
  'STRASSE',
  'PostgreSQL ICU uppercase expands sharp s to STRASSE'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'DOT', U&'\0130', 1)$$,
  'dotted capital I colour is accepted'
);

SELECT is(
  (SELECT colour_key FROM public.spools WHERE user_id = auth.uid() AND material = 'DOT'),
  U&'\0069\0307',
  'PostgreSQL ICU lowercase maps dotted capital I to i plus combining dot'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'GREEK', U&'\039F\03A3', 1)$$,
  'Greek uppercase sigma colour is accepted'
);

SELECT is(
  (SELECT colour_key FROM public.spools WHERE user_id = auth.uid() AND material = 'GREEK'),
  U&'\03BF\03C2',
  'PostgreSQL ICU lowercase applies final sigma contextually'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'UNICODE80', repeat(U&'\+01F600', 80), 1)$$,
  '80 supplementary Unicode code points fit the colour limit'
);

SELECT is(
  (SELECT char_length(colour)::integer FROM public.spools WHERE user_id = auth.uid() AND material = 'UNICODE80'),
  80,
  'supplementary colour length is counted in code points'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'UNICODE81', repeat(U&'\+01F600', 81), 1)$$,
  '23514',
  'new row for relation "spools" violates check constraint "spools_colour_length_check"',
  '81 supplementary Unicode code points exceed the colour limit'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', repeat(U&'\00DF', 40), 'White', 1)$$,
  '40 sharp s material code points fit after uppercase expansion'
);

SELECT is(
  (SELECT char_length(material)::integer FROM public.spools
    WHERE user_id = auth.uid() AND colour = 'White' AND recorded_grams = 1 AND char_length(material) = 80),
  80,
  'material limit is checked after ICU uppercase expansion'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', repeat(U&'\00DF', 41), 'White', 1)$$,
  '23514',
  'new row for relation "spools" violates check constraint "spools_material_length_check"',
  '41 sharp s material code points fail after uppercase expansion'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black / Red / Gold', 1)$$,
  'multicolour labels are accepted as a whole'
);

SELECT is(
  (SELECT colour FROM public.spools WHERE user_id = auth.uid() AND colour_key = 'black / red / gold'),
  'Black / Red / Gold',
  'multicolour label display and component order are preserved'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES
      ('00000000-0000-0000-0000-000000000001', 'PLA', 'Gold / Red / Black', 1),
      ('00000000-0000-0000-0000-000000000001', 'PLA', 'Grey', 1),
      ('00000000-0000-0000-0000-000000000001', 'PLA', 'Gray', 1)$$,
  'reordered colours and grey spelling variants are accepted'
);

SELECT is(
  (SELECT count(DISTINCT colour_key)::integer FROM public.spools
    WHERE user_id = auth.uid() AND material = 'PLA' AND colour IN ('Gold / Red / Black', 'Grey', 'Gray')),
  3,
  'reordered multicolour labels and Grey/Gray remain distinct'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', NULL, 'Black', 1)$$,
  '23502',
  'null value in column "material" of relation "spools" violates not-null constraint',
  'null material is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', NULL, 1)$$,
  '23502',
  'null value in column "colour" of relation "spools" violates not-null constraint',
  'null colour is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', NULL)$$,
  '42501',
  'new row violates row-level security policy for table "spools"',
  'null stock is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', '', 'Black', 1)$$,
  '23514',
  'new row for relation "spools" violates check constraint "spools_material_length_check"',
  'blank material is rejected after normalization'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', 1.5)$$,
  '23514',
  'new row for relation "spools" violates check constraint "spools_recorded_grams_valid"',
  'fractional stock is rejected without rounding'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', -1)$$,
  '42501',
  'new row violates row-level security policy for table "spools"',
  'negative stock is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', 'NaN'::numeric)$$,
  '23514',
  'new row for relation "spools" violates check constraint "spools_recorded_grams_valid"',
  'NaN stock is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', 'Infinity'::numeric)$$,
  '23514',
  'new row for relation "spools" violates check constraint "spools_recorded_grams_valid"',
  'infinite stock is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'PLA', 'Black', 2147483648)$$,
  '23514',
  'new row for relation "spools" violates check constraint "spools_recorded_grams_valid"',
  'stock above the integer representation limit is rejected'
);

SELECT lives_ok(
  $$INSERT INTO public.spools (user_id, material, colour, recorded_grams)
    VALUES ('00000000-0000-0000-0000-000000000001', 'MAXIMUM', 'Black', 2147483647)$$,
  'the integer representation maximum is accepted'
);

SELECT is(
  (SELECT count(*)::integer FROM public.spools
    WHERE user_id = auth.uid() AND material = repeat('S', 80)),
  1,
  '40 sharp s characters are stored as 80 uppercase S characters'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

SELECT is(
  (SELECT count(*)::integer FROM public.spools),
  1,
  'owner B sees only their own spool'
);

SELECT lives_ok(
  $$UPDATE public.spools SET recorded_grams = 1
    WHERE id = '10000000-0000-0000-0000-000000000001'$$,
  'owner B update of owner A spool completes without exposing the row'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

SELECT is(
  (SELECT recorded_grams FROM public.spools WHERE id = '10000000-0000-0000-0000-000000000001'),
  120::numeric,
  'owner B update leaves owner A stock unchanged'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

SELECT lives_ok(
  $$DELETE FROM public.spools WHERE id = '10000000-0000-0000-0000-000000000001'$$,
  'owner B delete of owner A spool completes without exposing the row'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

SELECT is(
  (SELECT count(*)::integer FROM public.spools WHERE id = '10000000-0000-0000-0000-000000000001'),
  1,
  'owner B cannot delete owner A spool'
);

SELECT is(
  (SELECT recorded_grams FROM public.spools WHERE id = '10000000-0000-0000-0000-000000000001'),
  120::numeric,
  'owner A spool remains unchanged after owner B attempts'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
