BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000041', 'edit-reserved-owner-a@example.test'),
  ('00000000-0000-0000-0000-000000000042', 'edit-reserved-owner-b@example.test');

INSERT INTO public.spools (id, user_id, material, colour, recorded_grams, created_at) VALUES
  ('32000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000041','PLA','Black',300,'2026-01-01 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000041','PLA','Black',90,'2026-01-02 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000041','PLA','Gray',100,'2026-01-03 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000041','PLA','White',90,'2026-01-04 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000042','PLA','Purple',150,'2026-01-05 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000042','PETG','Blue',160,'2026-01-06 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000042','PETG','Blue',150,'2026-01-07 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000042','PLA','Pink',150,'2026-01-08 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000107','00000000-0000-0000-0000-000000000042','PETG','Gray',150,'2026-01-01 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000042','PETG','Gray',150,'2026-01-02 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000042','PETG','Gray',150,'2026-01-02 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000108','00000000-0000-0000-0000-000000000042','PLA','Orange',150,'2026-01-09 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000109','00000000-0000-0000-0000-000000000042','ABS','Black',150,'2026-01-10 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000110','00000000-0000-0000-0000-000000000042','ABS','Black',150,'2026-01-10 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000042','PLA','Silver',150,'2026-01-11 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000042','PETG','Silver',200,'2026-01-12 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000113','00000000-0000-0000-0000-000000000042','TPU','Silver',200,'2026-01-13 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000114','00000000-0000-0000-0000-000000000042','PLA','Bronze',150,'2026-01-14 00:00:00+00'),
  ('32000000-0000-0000-0000-000000000115','00000000-0000-0000-0000-000000000042','PETG','Bronze',200,'2026-01-15 00:00:00+00');

INSERT INTO public.prints (id, user_id, name, material, colour, required_grams) VALUES
  ('42000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000041','Manual hold','PLA','Black',80),
  ('42000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000041','Capacity consumer','PLA','Black',190),
  ('42000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000041','Rounded demand','PLA','Gray',81),
  ('42000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000041','No fit','PLA','White',80),
  ('42000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000042','Candidate consumer','PETG','Blue',20),
  ('42000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000042','Manual fallback by capacity','PLA','Purple',80),
  ('42000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000042','Manual fallback by age','PLA','Pink',80),
  ('42000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000042','Manual fallback by ID','PLA','Orange',80),
  ('42000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000042','Repeated spool move','PLA','Silver',80),
  ('42000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000042','Settlement after move','PLA','Bronze',80);

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000041',true);
SET LOCAL ROLE authenticated;

SELECT is((public.reserve_print_material(
  '53000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001',1,
  '32000000-0000-0000-0000-000000000001','manual',88)->>'disposition'),
  'active','manual reservation starts on the selected spool');
SELECT is((public.reserve_print_material(
  '53000000-0000-0000-0000-000000000002','42000000-0000-0000-0000-000000000002',1,
  '32000000-0000-0000-0000-000000000001','manual',209)->>'disposition'),
  'active','another print consumes most of the manually selected spool capacity');
SELECT set_config('test.main_reservation',
  (SELECT reservation_id::text FROM public.planned_prints WHERE id='42000000-0000-0000-0000-000000000001'),true);
SELECT set_config('test.main_reserved_version',
  (SELECT version::text FROM public.prints WHERE id='42000000-0000-0000-0000-000000000001'),true);
SELECT is((public.save_account_safety_margin(5,0)->>'marginPercent')::numeric,5::numeric,
  'owner A saves a five percent margin');
SELECT is((SELECT reserved_grams FROM public.print_reservations
  WHERE print_id='42000000-0000-0000-0000-000000000001'),88::numeric,
  'a settings-only change leaves the active reservation amount unchanged');
SELECT is((SELECT margin_percent FROM public.print_reservations
  WHERE print_id='42000000-0000-0000-0000-000000000001'),10::numeric,
  'a settings-only change leaves the applied reservation margin unchanged');
SELECT is((public.reserve_print_material(
  '53000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001',1,
  '32000000-0000-0000-0000-000000000001','manual',88)->>'replayed')::boolean,true,
  'an active original reserve retry still succeeds after a settings-only change');

RESET ROLE;
UPDATE public.print_reservations SET created_at='2026-10-01 12:00:00+00'
  WHERE id=current_setting('test.main_reservation')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('test.main_created_at',
  (SELECT created_at::text FROM public.print_reservations
    WHERE id=current_setting('test.main_reservation')::uuid),true);
SELECT set_config('test.main_edit_result',public.update_print(
  '42000000-0000-0000-0000-000000000001',2,'Manual hold saved','PLA','Black',80)::text,true);
SELECT is(current_setting('test.main_edit_result')::jsonb->'recalculation'->>'outcome',
  'manual_retained','an eligible manual spool is retained even when another eligible spool is a tighter fit');
SELECT is((current_setting('test.main_edit_result')::jsonb->'recalculation'->>'marginPercent')::numeric,
  5::numeric,'reserved edits use the current account margin');
SELECT is((current_setting('test.main_edit_result')::jsonb->'recalculation'->>'reservationGrams')::numeric,
  84::numeric,'reserved edits calculate the new hold with the current margin');
SELECT is(current_setting('test.main_edit_result')::jsonb->'print'->>'version','3',
  'the print transaction snapshot contains its final version');
SELECT is(current_setting('test.main_edit_result')::jsonb->'print'->'reservation'->>'id',
  current_setting('test.main_reservation'),'a reserved edit keeps the reservation ID');
SELECT is((current_setting('test.main_edit_result')::jsonb->'print'->'reservation'->>'reservedGrams')::numeric,
  84::numeric,'the transaction snapshot contains the recalculated reservation projection');
SELECT is((SELECT version FROM public.prints WHERE id='42000000-0000-0000-0000-000000000001'),3,
  'a reserved no-op save advances the print version exactly once');
SELECT is((SELECT reserved_grams FROM public.print_reservations
  WHERE print_id='42000000-0000-0000-0000-000000000001'),84::numeric,
  'the recalculation excludes its own previous hold when checking capacity');
SELECT is((SELECT recorded_grams FROM public.spools WHERE id='32000000-0000-0000-0000-000000000001'),300::numeric,
  'recalculation never changes recorded stock');
SELECT is((SELECT available_grams FROM public.spool_inventory WHERE id='32000000-0000-0000-0000-000000000001'),7::numeric,
  'remaining availability accounts for the other hold and the recalculated hold');
SELECT set_config('test.noop_edit_expected_version',
  (SELECT version::text FROM public.prints WHERE id='42000000-0000-0000-0000-000000000001'),true);
SELECT set_config('test.noop_edit_result',public.update_print(
  '42000000-0000-0000-0000-000000000001',current_setting('test.noop_edit_expected_version')::integer,
  'Manual hold name only','PLA','Black',80)::text,true);
SELECT is(current_setting('test.noop_edit_result')::jsonb->'print'->>'version','4',
  'a name-only reserved edit advances the print version once');
SELECT is(current_setting('test.noop_edit_result')::jsonb->'print'->'reservation'->>'id',
  current_setting('test.main_reservation'),'a name-only edit keeps the active reservation identity');
SELECT throws_ok(
  $$SELECT public.release_print_material(current_setting('test.main_reservation')::uuid,
    '42000000-0000-0000-0000-000000000001',current_setting('test.noop_edit_expected_version')::integer)$$,
  'P0001','edit_conflict','release captured before a name-only edit is stale while the same reservation remains active'
);

RESET ROLE;
SELECT is((SELECT created_at::text FROM public.print_reservations
  WHERE id=current_setting('test.main_reservation')::uuid),current_setting('test.main_created_at'),
  'recalculation preserves reservation age');
SELECT is((SELECT count(*)::integer FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid='private.reservation_requests'::regclass
    AND constraint_row.contype='f'
    AND pg_get_constraintdef(constraint_row.oid) ILIKE '%allocation_spool_id%'),0,
  'current allocation evidence has no spool foreign key');
SELECT is((SELECT spool_id FROM private.reservation_requests
  WHERE request_id='53000000-0000-0000-0000-000000000001'),
  '32000000-0000-0000-0000-000000000001'::uuid,
  'the original reserve spool fingerprint is unchanged');
SELECT is((SELECT allocation_spool_id FROM private.reservation_requests
  WHERE request_id='53000000-0000-0000-0000-000000000001'),
  '32000000-0000-0000-0000-000000000001'::uuid,
  'current allocation evidence tracks the active spool');
SELECT is((SELECT expected_version FROM private.reservation_requests
  WHERE request_id='53000000-0000-0000-0000-000000000001'),1,
  'the original expected-version fingerprint is unchanged');
SELECT is((SELECT expected_reservation_grams FROM private.reservation_requests
  WHERE request_id='53000000-0000-0000-0000-000000000001'),88::numeric,
  'the original amount witness is unchanged');
SELECT is((SELECT recalculated_at IS NOT NULL FROM private.reservation_requests
  WHERE request_id='53000000-0000-0000-0000-000000000001'),true,
  'the request records that recalculation superseded its original command');
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.reserve_print_material('53000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001',1,'32000000-0000-0000-0000-000000000001','manual',88)$$,
  'P0001','reservation_request_completed','the original reserve command cannot replay after recalculation'
);
SELECT throws_ok(
  $$SELECT public.release_print_material(current_setting('test.main_reservation')::uuid,'42000000-0000-0000-0000-000000000001',current_setting('test.main_reserved_version')::integer)$$,
  'P0001','edit_conflict','a cancellation captured before recalculation is stale while the same reservation remains active'
);
SELECT set_config('test.main_recalculated_version',
  current_setting('test.noop_edit_result')::jsonb->'print'->>'version',true);
SELECT is((public.release_print_material(current_setting('test.main_reservation')::uuid,
  '42000000-0000-0000-0000-000000000001',current_setting('test.main_recalculated_version')::integer)->>'disposition'),
  'released','cancellation with the current version releases once');
SELECT set_config('test.replacement_before_reserve_version',
  (SELECT version::text FROM public.prints WHERE id='42000000-0000-0000-0000-000000000001'),true);
SELECT set_config('test.replacement_reserve_result',public.reserve_print_material(
  '53000000-0000-0000-0000-000000000003','42000000-0000-0000-0000-000000000001',
  current_setting('test.replacement_before_reserve_version')::integer,
  '32000000-0000-0000-0000-000000000002','best_fit',84)::text,true);
SELECT set_config('test.replacement_reservation',
  current_setting('test.replacement_reserve_result')::jsonb->>'reservationId',true);
SELECT set_config('test.replacement_reserve_version',
  (SELECT version::text FROM public.prints WHERE id='42000000-0000-0000-0000-000000000001'),true);
SELECT is((public.release_print_material(current_setting('test.main_reservation')::uuid,
  '42000000-0000-0000-0000-000000000001',current_setting('test.main_recalculated_version')::integer)->>'disposition'),
  'already_released','a terminal old cancellation remains harmless after a new reservation');
SELECT is((SELECT reservation_id FROM public.planned_prints
  WHERE id='42000000-0000-0000-0000-000000000001'),
  current_setting('test.replacement_reservation')::uuid,
  'the old terminal cancellation leaves the new reservation active');

SELECT is((public.reserve_print_material(
  '53000000-0000-0000-0000-000000000004','42000000-0000-0000-0000-000000000003',1,
  '32000000-0000-0000-0000-000000000003','best_fit',86)->>'disposition'),
  'active','an 81 gram print reserves a rounded 86 grams at five percent');
SELECT is((SELECT reserved_grams FROM public.print_reservations
  WHERE print_id='42000000-0000-0000-0000-000000000003'),86::numeric,
  'ceil rounding is applied to the current-margin reservation amount');

SELECT is((public.reserve_print_material(
  '53000000-0000-0000-0000-000000000005','42000000-0000-0000-0000-000000000004',1,
  '32000000-0000-0000-0000-000000000004','manual',84)->>'disposition'),
  'active','the no-fit print starts with a valid reservation');
SELECT set_config('test.no_fit_reservation',
  (SELECT reservation_id::text FROM public.planned_prints WHERE id='42000000-0000-0000-0000-000000000004'),true);
SELECT set_config('test.no_fit_result',public.update_print(
  '42000000-0000-0000-0000-000000000004',2,'Saved without material','PLA','White',1000)::text,true);
SELECT is(current_setting('test.no_fit_result')::jsonb->'recalculation'->>'outcome',
  'insufficient_material','a valid edit saves successfully when no spool fits');
SELECT is(current_setting('test.no_fit_result')::jsonb->'print'->'reservation','null'::jsonb,
  'a committed no-fit edit returns an unreserved print');
SELECT is((SELECT required_grams FROM public.prints WHERE id='42000000-0000-0000-0000-000000000004'),1000::numeric,
  'the no-fit edit keeps the new print requirements');
SELECT is((SELECT version FROM public.prints WHERE id='42000000-0000-0000-0000-000000000004'),3,
  'the no-fit edit advances the print version once');
RESET ROLE;
SELECT is((SELECT state FROM private.reservation_requests
  WHERE request_id='53000000-0000-0000-0000-000000000005'),'released',
  'no-fit terminalizes the original reservation request');
SELECT is((SELECT allocation_spool_id FROM private.reservation_requests
  WHERE request_id='53000000-0000-0000-0000-000000000005'),
  '32000000-0000-0000-0000-000000000004'::uuid,
  'no-fit retains the last held spool in allocation evidence');
SET LOCAL ROLE authenticated;
SELECT is((SELECT reservation_id FROM public.planned_prints
  WHERE id='42000000-0000-0000-0000-000000000004'),NULL::uuid,
  'no-fit removes the active reservation');
SELECT throws_ok(
  $$SELECT public.reserve_print_material('53000000-0000-0000-0000-000000000005','42000000-0000-0000-0000-000000000004',1,'32000000-0000-0000-0000-000000000004','manual',84)$$,
  'P0001','reservation_request_completed','a no-fit reserve request cannot be replayed');

RESET ROLE;
SELECT set_config('test.main_rollback_snapshot',jsonb_build_object(
  'print',(SELECT to_jsonb(print) FROM public.prints print WHERE print.id='42000000-0000-0000-0000-000000000001'),
  'reservation',(SELECT to_jsonb(reservation) FROM public.print_reservations reservation
    WHERE reservation.id=current_setting('test.replacement_reservation')::uuid),
  'request',(SELECT to_jsonb(request) FROM private.reservation_requests request
    WHERE request.reservation_id=current_setting('test.replacement_reservation')::uuid)
)::text,true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.update_print('42000000-0000-0000-0000-000000000001',4,'Stale edit','PLA','Black',80)$$,
  'P0001','edit_conflict','a stale edit is rejected before changing reservation evidence');
SELECT throws_ok(
  $$SELECT public.update_print('42000000-0000-0000-0000-000000000001',
    current_setting('test.replacement_reserve_version')::integer,'Invalid edit','PLA','Black',0)$$,
  '23514','new row for relation "prints" violates check constraint "prints_required_grams_valid"',
  'a database-invalid edit is rejected');
RESET ROLE;
SELECT is(jsonb_build_object(
  'print',(SELECT to_jsonb(print) FROM public.prints print WHERE print.id='42000000-0000-0000-0000-000000000001'),
  'reservation',(SELECT to_jsonb(reservation) FROM public.print_reservations reservation
    WHERE reservation.id=current_setting('test.replacement_reservation')::uuid),
  'request',(SELECT to_jsonb(request) FROM private.reservation_requests request
    WHERE request.reservation_id=current_setting('test.replacement_reservation')::uuid)
),current_setting('test.main_rollback_snapshot')::jsonb,
  'failed stale and invalid edits roll back print and reservation evidence changes');
SELECT is((SELECT version FROM public.prints WHERE id='42000000-0000-0000-0000-000000000001'),
  current_setting('test.replacement_reserve_version')::integer,
  'failed edits do not advance the print version');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000042',true);
SELECT is((public.reserve_print_material(
  '53000000-0000-0000-0000-000000000011','42000000-0000-0000-0000-000000000011',1,
  '32000000-0000-0000-0000-000000000102','manual',22)->>'disposition'),
  'active','owner B reserves candidate stock for deterministic selection');
SELECT is((public.reserve_print_material(
  '53000000-0000-0000-0000-000000000012','42000000-0000-0000-0000-000000000012',1,
  '32000000-0000-0000-0000-000000000101','manual',88)->>'disposition'),
  'active','the manual fallback fixture starts on its selected spool');
SELECT set_config('test.capacity_fallback_reservation',
  (SELECT reservation_id::text FROM public.planned_prints WHERE id='42000000-0000-0000-0000-000000000012'),true);
SELECT set_config('test.capacity_fallback_result',public.update_print(
  '42000000-0000-0000-0000-000000000012',2,'Fallback by available grams','PETG','Blue',80)::text,true);
SELECT is(current_setting('test.capacity_fallback_result')::jsonb->'recalculation'->>'outcome',
  'manual_fallback','an ineligible manual choice falls back to best-fit');
SELECT is(current_setting('test.capacity_fallback_result')::jsonb->'print'->'reservation'->>'spoolId',
  '32000000-0000-0000-0000-000000000102',
  'best-fit chooses the candidate with the least available capacity');
SELECT is((SELECT selection_mode FROM public.print_reservations
  WHERE print_id='42000000-0000-0000-0000-000000000012'),'best_fit',
  'a manual fallback becomes best-fit for later edits');
SELECT is((public.update_print('42000000-0000-0000-0000-000000000012',3,
  'Automatic after fallback','PETG','Blue',85)->'recalculation'->>'outcome'),
  'best_fit','the next edit uses the persisted best-fit selection mode');

SELECT is((public.reserve_print_material(
  '53000000-0000-0000-0000-000000000013','42000000-0000-0000-0000-000000000013',1,
  '32000000-0000-0000-0000-000000000104','manual',88)->>'disposition'),
  'active','the creation-time tie fixture starts on its manual source spool');
SELECT is((public.update_print('42000000-0000-0000-0000-000000000013',2,
  'Fallback by spool age','PETG','Gray',80)->'print'->'reservation'->>'spoolId'),
  '32000000-0000-0000-0000-000000000107',
  'equal-capacity best-fit candidates use earlier spool creation time before ID');

SELECT is((public.reserve_print_material(
  '53000000-0000-0000-0000-000000000014','42000000-0000-0000-0000-000000000014',1,
  '32000000-0000-0000-0000-000000000108','manual',88)->>'disposition'),
  'active','the spool-ID tie fixture starts on its manual source spool');
SELECT is((public.update_print('42000000-0000-0000-0000-000000000014',2,
  'Fallback by spool ID','ABS','Black',80)->'print'->'reservation'->>'spoolId'),
  '32000000-0000-0000-0000-000000000109',
  'equal-capacity equal-age best-fit candidates use ascending spool ID');

SELECT is((public.reserve_print_material(
  '53000000-0000-0000-0000-000000000015','42000000-0000-0000-0000-000000000015',1,
  '32000000-0000-0000-0000-000000000111','manual',88)->>'disposition'),
  'active','the repeated-move fixture starts on spool A');
SELECT set_config('test.moved_reservation',
  (SELECT reservation_id::text FROM public.planned_prints WHERE id='42000000-0000-0000-0000-000000000015'),true);
SELECT set_config('test.moved_reserved_version',
  (SELECT version::text FROM public.prints WHERE id='42000000-0000-0000-0000-000000000015'),true);
SELECT set_config('test.moved_created_at',
  (SELECT created_at::text FROM public.print_reservations WHERE id=current_setting('test.moved_reservation')::uuid),true);
SELECT set_config('test.first_move_result',public.update_print(
  '42000000-0000-0000-0000-000000000015',2,'Moved to B','PETG','Silver',80)::text,true);
SELECT is(current_setting('test.first_move_result')::jsonb->'print'->'reservation'->>'id',
  current_setting('test.moved_reservation'),'the first spool move keeps the reservation ID');
SELECT is(current_setting('test.first_move_result')::jsonb->'print'->'reservation'->>'spoolId',
  '32000000-0000-0000-0000-000000000112','the first spool move assigns spool B');
SELECT is((public.delete_spool('32000000-0000-0000-0000-000000000111')->>'id'),
  '32000000-0000-0000-0000-000000000111','the original spool can be deleted after reassignment');
RESET ROLE;
SELECT is((SELECT spool_id FROM private.reservation_requests
  WHERE reservation_id=current_setting('test.moved_reservation')::uuid),
  '32000000-0000-0000-0000-000000000111'::uuid,
  'the original spool fingerprint survives deletion of spool A');
SELECT is((SELECT allocation_spool_id FROM private.reservation_requests
  WHERE reservation_id=current_setting('test.moved_reservation')::uuid),
  '32000000-0000-0000-0000-000000000112'::uuid,
  'current allocation evidence advances from spool A to spool B');
SET LOCAL ROLE authenticated;
SELECT set_config('test.second_move_result',public.update_print(
  '42000000-0000-0000-0000-000000000015',3,'Moved to C','TPU','Silver',80)::text,true);
SELECT is(current_setting('test.second_move_result')::jsonb->'recalculation'->>'outcome',
  'best_fit','a manual fallback remains automatic on a later edit');
SELECT is(current_setting('test.second_move_result')::jsonb->'print'->'reservation'->>'id',
  current_setting('test.moved_reservation'),'the second spool move keeps the same reservation ID');
SELECT is(current_setting('test.second_move_result')::jsonb->'print'->'reservation'->>'spoolId',
  '32000000-0000-0000-0000-000000000113','the second spool move assigns spool C');
SELECT is((SELECT created_at::text FROM public.print_reservations
  WHERE id=current_setting('test.moved_reservation')::uuid),current_setting('test.moved_created_at'),
  'repeated spool moves preserve the original reservation age');
SELECT throws_ok(
  $$SELECT public.release_print_material(current_setting('test.moved_reservation')::uuid,'42000000-0000-0000-0000-000000000015',current_setting('test.moved_reserved_version')::integer)$$,
  'P0001','edit_conflict','release captured before repeated moves is stale');
SELECT set_config('test.moved_recalculated_version',
  current_setting('test.second_move_result')::jsonb->'print'->>'version',true);
SELECT is((public.release_print_material(current_setting('test.moved_reservation')::uuid,
  '42000000-0000-0000-0000-000000000015',current_setting('test.moved_recalculated_version')::integer)->'spool'->>'id'),
  '32000000-0000-0000-0000-000000000113',
  'release feedback reports the latest assigned spool C');
RESET ROLE;
SELECT is((SELECT allocation_spool_id FROM private.reservation_requests
  WHERE reservation_id=current_setting('test.moved_reservation')::uuid),
  '32000000-0000-0000-0000-000000000113'::uuid,
  'terminal release retains the latest allocation evidence');
SET LOCAL ROLE authenticated;

SELECT is((public.reserve_print_material(
  '53000000-0000-0000-0000-000000000016','42000000-0000-0000-0000-000000000016',1,
  '32000000-0000-0000-0000-000000000114','manual',88)->>'disposition'),
  'active','the settlement-after-move fixture starts on spool A');
SELECT set_config('test.settlement_move_reservation',
  (SELECT reservation_id::text FROM public.planned_prints WHERE id='42000000-0000-0000-0000-000000000016'),true);
SELECT set_config('test.settlement_move_result',public.update_print(
  '42000000-0000-0000-0000-000000000016',2,'Moved before settlement','PETG','Bronze',80)::text,true);
SELECT is(current_setting('test.settlement_move_result')::jsonb->'print'->'reservation'->>'spoolId',
  '32000000-0000-0000-0000-000000000115','the settlement fixture reallocates from A to B');
SELECT set_config('test.settlement_after_move_result',public.settle_print_consumption(
  '54000000-0000-0000-0000-000000000016','42000000-0000-0000-0000-000000000016',3,
  current_setting('test.settlement_move_reservation')::uuid,25)::text,true);
SELECT is(current_setting('test.settlement_after_move_result')::jsonb->'settlement'->'spool'->>'id',
  '32000000-0000-0000-0000-000000000115',
  'settlement resolves the current allocation spool rather than the original command spool');
SELECT is((SELECT recorded_grams FROM public.spools WHERE id='32000000-0000-0000-0000-000000000115'),175::numeric,
  'settlement deducts consumption from the current spool');
SELECT is((SELECT recorded_grams FROM public.spools WHERE id='32000000-0000-0000-0000-000000000114'),150::numeric,
  'settlement leaves the original spool stock unchanged');
RESET ROLE;
SELECT is((SELECT spool_id FROM private.reservation_requests
  WHERE reservation_id=current_setting('test.settlement_move_reservation')::uuid),
  '32000000-0000-0000-0000-000000000114'::uuid,
  'settlement keeps the original reservation fingerprint');
SELECT is((SELECT allocation_spool_id FROM private.reservation_requests
  WHERE reservation_id=current_setting('test.settlement_move_reservation')::uuid),
  '32000000-0000-0000-0000-000000000115'::uuid,
  'settlement retains the current-spool evidence after completion');
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000041',true);
SELECT throws_ok(
  $$SELECT public.release_print_material(current_setting('test.capacity_fallback_reservation')::uuid,'42000000-0000-0000-0000-000000000012',1)$$,
  'P0002','not_found','another owner cannot release a guessed reservation identity');
RESET ROLE;
SELECT is((SELECT reservation_id FROM public.planned_prints
  WHERE id='42000000-0000-0000-0000-000000000012'),
  current_setting('test.capacity_fallback_reservation')::uuid,
  'a foreign release attempt preserves the other owner reservation');

SELECT * FROM finish();
ROLLBACK;
