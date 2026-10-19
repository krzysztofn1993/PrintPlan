BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000021', 'settings-owner-a@example.test'),
  ('00000000-0000-0000-0000-000000000022', 'settings-owner-b@example.test');
INSERT INTO public.spools (id,user_id,material,colour,recorded_grams) VALUES
  ('30000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000021','PLA','Black',150),
  ('30000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000021','PLA','Black',500),
  ('30000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000022','PLA','Black',150);
INSERT INTO public.prints (id,user_id,name,material,colour,required_grams) VALUES
  ('40000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000021','Existing snapshot','PLA','Black',80),
  ('40000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000021','Changed margin','PLA','Black',80),
  ('40000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000021','Same rounded grams','PLA','Black',80),
  ('40000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000021','One gram','PLA','Black',1),
  ('40000000-0000-0000-0000-000000000025','00000000-0000-0000-0000-000000000021','Round upward','PLA','Black',81),
  ('40000000-0000-0000-0000-000000000026','00000000-0000-0000-0000-000000000021','Change away and back','PLA','Black',80),
  ('40000000-0000-0000-0000-000000000027','00000000-0000-0000-0000-000000000021','Maximum adjusted demand','PLA','Black',2147483647),
  ('40000000-0000-0000-0000-000000000028','00000000-0000-0000-0000-000000000021','Manual selection','PLA','Black',80);

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
SET LOCAL ROLE authenticated;

SELECT is(public.get_account_settings(), '{"marginPercent":10,"version":0}'::jsonb,
  'an existing account without a setting reads the 10 percent default at version zero');
SELECT ok(NOT has_table_privilege('authenticated','public.account_settings','INSERT'),
  'authenticated users cannot directly insert account settings');
SELECT ok(NOT has_table_privilege('authenticated','public.account_settings','UPDATE'),
  'authenticated users cannot directly update account settings');
SELECT ok(NOT has_table_privilege('authenticated','public.account_settings','DELETE'),
  'authenticated users cannot directly delete account settings');
SELECT throws_ok(
  $$INSERT INTO public.account_settings (user_id,margin_percent,version) VALUES (auth.uid(),5,1)$$,
  '42501','permission denied for table account_settings','direct settings inserts are denied'
);
SELECT throws_ok(
  $$UPDATE public.account_settings SET margin_percent=5 WHERE user_id=auth.uid()$$,
  '42501','permission denied for table account_settings','direct settings updates are denied'
);
SELECT throws_ok(
  $$DELETE FROM public.account_settings WHERE user_id=auth.uid()$$,
  '42501','permission denied for table account_settings','direct settings deletes are denied'
);
SELECT is((SELECT count(*)::integer FROM public.account_settings
  WHERE user_id='00000000-0000-0000-0000-000000000022'),0,
  'owner-only RLS hides another account setting');
SELECT is((public.preview_print_reservation('40000000-0000-0000-0000-000000000021')->>'reservationGrams')::numeric,
  88::numeric,'the default margin previews an 80 gram print at 88 grams');
SELECT is((public.reserve_print_material(
  '50000000-0000-0000-0000-000000000021','40000000-0000-0000-0000-000000000021',1,
  '30000000-0000-0000-0000-000000000021','best_fit',88)->>'disposition'),
  'active','a fresh reservation stores the confirmed amount');
SELECT set_config('test.settings_existing_reservation',
  (SELECT reservation_id::text FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000021'),true);
SELECT is((SELECT reserved_grams FROM public.print_reservations
  WHERE id=current_setting('test.settings_existing_reservation')::uuid),88::numeric,
  'the initial reservation snapshot contains 88 grams');
SELECT is((SELECT margin_percent FROM public.print_reservations
  WHERE id=current_setting('test.settings_existing_reservation')::uuid),10::numeric,
  'the initial reservation snapshot contains the default margin');

SELECT is(public.save_account_safety_margin(5,0), '{"marginPercent":5,"version":1}'::jsonb,
  'the first explicit save creates version one');
SELECT is((SELECT reserved_grams FROM public.print_reservations
  WHERE id=current_setting('test.settings_existing_reservation')::uuid),88::numeric,
  'saving a setting leaves the existing reservation amount unchanged');
SELECT is((SELECT margin_percent FROM public.print_reservations
  WHERE id=current_setting('test.settings_existing_reservation')::uuid),10::numeric,
  'saving a setting leaves the applied reservation margin unchanged');
SELECT is((SELECT version FROM public.prints WHERE id='40000000-0000-0000-0000-000000000021'),2,
  'saving a setting does not advance a print version');
SELECT is((SELECT recorded_grams FROM public.spools WHERE id='30000000-0000-0000-0000-000000000021'),150::numeric,
  'saving a setting does not change recorded stock');
SELECT is((SELECT reserved_grams FROM public.spool_inventory WHERE id='30000000-0000-0000-0000-000000000021'),88::numeric,
  'saving a setting does not change reserved stock');
SELECT is(public.save_account_safety_margin(5,1), '{"marginPercent":5,"version":2}'::jsonb,
  'saving the same value still advances the version');
SELECT throws_ok(
  $$SELECT public.save_account_safety_margin(10,0)$$,
  'P0001','settings_conflict','a stale expected settings version is rejected'
);
SELECT is(public.save_account_safety_margin(10,2), '{"marginPercent":10,"version":3}'::jsonb,
  'an integral 10 percent setting is accepted');
SELECT is((public.preview_print_reservation('40000000-0000-0000-0000-000000000022')->>'reservationGrams')::numeric,
  88::numeric,'an 80 gram print still previews at 88 grams with 10 percent');
SELECT is(public.save_account_safety_margin(5,3), '{"marginPercent":5,"version":4}'::jsonb,
  'an integral 5 percent setting is accepted');
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000022','40000000-0000-0000-0000-000000000022',1,'30000000-0000-0000-0000-000000000022','best_fit',88)$$,
  'P0001','reservation_amount_stale','the old 88 gram confirmation is rejected at 5 percent'
);
SELECT is((SELECT reservation_id FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000022'),NULL::uuid,
  'a stale confirmation writes no reservation');
SELECT is((public.reserve_print_material(
  '50000000-0000-0000-0000-000000000022','40000000-0000-0000-0000-000000000022',1,
  '30000000-0000-0000-0000-000000000022','best_fit',84)->>'disposition'),
  'active','the later 84 gram confirmation succeeds at 5 percent');
SELECT is((SELECT reserved_grams FROM public.print_reservations
  WHERE print_id='40000000-0000-0000-0000-000000000022'),84::numeric,
  'the fresh reservation stores 84 grams');
SELECT is((public.reserve_print_material(
  '50000000-0000-0000-0000-000000000021','40000000-0000-0000-0000-000000000021',1,
  '30000000-0000-0000-0000-000000000021','best_fit',88)->>'replayed')::boolean,true,
  'an exact successful request replays after later settings changes');
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000021','40000000-0000-0000-0000-000000000021',1,'30000000-0000-0000-0000-000000000021','best_fit',84)$$,
  'P0001','idempotency_conflict','changing the original reservation witness conflicts');
SELECT is((SELECT reserved_grams FROM public.print_reservations
  WHERE id=current_setting('test.settings_existing_reservation')::uuid),88::numeric,
  'replay and a changed witness preserve the original reservation snapshot');
SELECT is((SELECT margin_percent FROM public.print_reservations
  WHERE id=current_setting('test.settings_existing_reservation')::uuid),10::numeric,
  'replay after a settings change retains the original applied margin');

SELECT is(public.save_account_safety_margin(10,4), '{"marginPercent":10,"version":5}'::jsonb,
  'the margin can return to 10 percent');
SELECT is((public.preview_print_reservation('40000000-0000-0000-0000-000000000023')->>'reservationGrams')::numeric,
  88::numeric,'the 10 percent preview is 88 grams');
SELECT is(public.save_account_safety_margin(9,5), '{"marginPercent":9,"version":6}'::jsonb,
  'an integral 9 percent setting is accepted');
SELECT is((public.reserve_print_material(
  '50000000-0000-0000-0000-000000000023','40000000-0000-0000-0000-000000000023',1,
  '30000000-0000-0000-0000-000000000022','best_fit',88)->>'disposition'),
  'active','a changed percentage with identical rounded grams accepts the reviewed amount');
SELECT is((SELECT margin_percent FROM public.print_reservations WHERE print_id='40000000-0000-0000-0000-000000000023'),
  9::numeric,'the reservation records the current 9 percent setting');
SELECT is((SELECT reserved_grams FROM public.print_reservations WHERE print_id='40000000-0000-0000-0000-000000000023'),
  88::numeric,'the reservation retains the 88 gram reviewed amount');

SELECT is(public.save_account_safety_margin(10,6), '{"marginPercent":10,"version":7}'::jsonb,
  'the one gram case starts at 10 percent');
SELECT is((public.preview_print_reservation('40000000-0000-0000-0000-000000000024')->>'reservationGrams')::numeric,
  2::numeric,'one gram at 10 percent rounds up to two grams');
SELECT is(public.save_account_safety_margin(5,7), '{"marginPercent":5,"version":8}'::jsonb,
  'the one gram case changes to 5 percent');
SELECT is((public.reserve_print_material(
  '50000000-0000-0000-0000-000000000024','40000000-0000-0000-0000-000000000024',1,
  '30000000-0000-0000-0000-000000000021','best_fit',2)->>'disposition'),
  'active','one gram at 10 percent to 5 percent keeps the confirmed two grams');
SELECT is((SELECT reserved_grams FROM public.print_reservations WHERE print_id='40000000-0000-0000-0000-000000000024'),
  2::numeric,'the small reservation remains two grams');

SELECT is((public.preview_print_reservation('40000000-0000-0000-0000-000000000025')->>'reservationGrams')::numeric,
  86::numeric,'81 grams at 5 percent rounds upward to 86 grams');
SELECT is((public.reserve_print_material(
  '50000000-0000-0000-0000-000000000025','40000000-0000-0000-0000-000000000025',1,
  '30000000-0000-0000-0000-000000000022','best_fit',86)->>'disposition'),
  'active','the 86 gram rounded-up confirmation is accepted');

SELECT is(public.save_account_safety_margin(10,8), '{"marginPercent":10,"version":9}'::jsonb,
  'the change-away-and-back case previews at 10 percent');
SELECT is((public.preview_print_reservation('40000000-0000-0000-0000-000000000026')->>'reservationGrams')::numeric,
  88::numeric,'the original 10 percent amount is captured before changing away');
SELECT is(public.save_account_safety_margin(5,9), '{"marginPercent":5,"version":10}'::jsonb,
  'the change-away-and-back case changes to 5 percent');
SELECT is(public.save_account_safety_margin(10,10), '{"marginPercent":10,"version":11}'::jsonb,
  'the change-away-and-back case returns to 10 percent');
SELECT is((public.reserve_print_material(
  '50000000-0000-0000-0000-000000000026','40000000-0000-0000-0000-000000000026',1,
  '30000000-0000-0000-0000-000000000022','best_fit',88)->>'disposition'),
  'active','change-away-and-back accepts the unchanged reviewed grams');

SELECT is((public.preview_print_reservation('40000000-0000-0000-0000-000000000028')->>'reservationGrams')::numeric,
  88::numeric,'manual mode uses the same current margin arithmetic');
SELECT is((public.reserve_print_material(
  '50000000-0000-0000-0000-000000000028','40000000-0000-0000-0000-000000000028',1,
  '30000000-0000-0000-0000-000000000022','manual',88)->>'disposition'),
  'active','manual selection accepts the same confirmed amount');

SELECT is(public.save_account_safety_margin(100,11), '{"marginPercent":100,"version":12}'::jsonb,
  'the upper 100 percent boundary is accepted');
SELECT is((public.preview_print_reservation('40000000-0000-0000-0000-000000000027')->>'reservationGrams')::numeric,
  4294967294::numeric,'maximum input at 100 percent remains representable');
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000027','40000000-0000-0000-0000-000000000027',1,'30000000-0000-0000-0000-000000000022','best_fit',4294967294)$$,
  'P0001','insufficient_material','maximum adjusted demand fails as insufficient stock without overflow'
);
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000029','40000000-0000-0000-0000-000000000027',1,'30000000-0000-0000-0000-000000000022','best_fit',1.5)$$,
  '22023','invalid_reservation_amount','a fractional reservation witness is rejected'
);
SELECT is((SELECT reservation_id FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000027'),NULL::uuid,
  'maximum and invalid witness failures do not write a reservation');

SELECT throws_ok($$SELECT public.save_account_safety_margin(NULL,12)$$,
  '22023','invalid_account_settings','NULL margins are rejected');
SELECT throws_ok($$SELECT public.save_account_safety_margin(5.5,12)$$,
  '22023','invalid_account_settings','fractional margins are rejected');
SELECT throws_ok($$SELECT public.save_account_safety_margin(-1,12)$$,
  '22023','invalid_account_settings','negative margins are rejected');
SELECT throws_ok($$SELECT public.save_account_safety_margin(101,12)$$,
  '22023','invalid_account_settings','margins above 100 are rejected');
SELECT throws_ok($$SELECT public.save_account_safety_margin(5,NULL)$$,
  '22023','invalid_account_settings','NULL expected settings versions are rejected');
SELECT throws_ok($$SELECT public.save_account_safety_margin(5,-1)$$,
  '22023','invalid_account_settings','negative expected settings versions are rejected');
SELECT is(public.get_account_settings(), '{"marginPercent":100,"version":12}'::jsonb,
  'rejected saves leave the saved settings unchanged');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000022',true);
SELECT is(public.get_account_settings(), '{"marginPercent":10,"version":0}'::jsonb,
  'a second existing account has its own absent-row default');
SELECT is(public.save_account_safety_margin(0,0), '{"marginPercent":0,"version":1}'::jsonb,
  'the integral 0 percent boundary is accepted for the second owner');
SELECT is(public.get_account_settings(), '{"marginPercent":0,"version":1}'::jsonb,
  'settings RPCs derive the second owner from the authenticated identity');
SELECT is((SELECT count(*)::integer FROM public.account_settings
  WHERE user_id='00000000-0000-0000-0000-000000000021'),0,
  'owner-only RLS hides the first account setting from the second owner');

RESET ROLE;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000023', 'settings-owner-created@example.test');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000023',true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_account_settings(), '{"marginPercent":10,"version":0}'::jsonb,
  'a newly created account also reads the absent-row default');
SELECT is((SELECT count(*)::integer FROM public.account_settings WHERE user_id=auth.uid()),0,
  'reading the default does not create a settings row');

SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$SELECT public.get_account_settings()$$,
  '42501','not_authenticated','settings reads require authentication');
SELECT throws_ok($$SELECT public.save_account_safety_margin(5,0)$$,
  '42501','not_authenticated','settings saves require authentication');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
