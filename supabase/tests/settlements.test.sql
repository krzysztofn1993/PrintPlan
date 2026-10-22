BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000031', 'settlement-owner-a@example.test'),
  ('00000000-0000-0000-0000-000000000032', 'settlement-owner-b@example.test');
INSERT INTO public.spools (id, user_id, material, colour, recorded_grams) VALUES
  ('31000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000031','PLA','Black',300),
  ('31000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000031','PLA','Blue',150),
  ('31000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000031','PETG','White',150),
  ('31000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000031','TPU','Red',150),
  ('31000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000031','ABS','Green',150),
  ('31000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000032','PLA','Black',150),
  ('31000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000031','PLA','Orange',250),
  ('31000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000031','PLA','Silver',300);
INSERT INTO public.prints (id, user_id, name, material, colour, required_grams) VALUES
  ('41000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000031','Completed','PLA','Black',80),
  ('41000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000031','Oldest','PLA','Black',60),
  ('41000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000031','Middle','PLA','Black',50),
  ('41000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000031','Newest','PLA','Black',40),
  ('41000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000031','Zero use','PLA','Blue',80),
  ('41000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000031','Exact estimate','PETG','White',80),
  ('41000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000031','Over estimate','TPU','Red',80),
  ('41000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000031','Unreserved','ABS','Green',80),
  ('41000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000032','Foreign','PLA','Black',80),
  ('41000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000031','Tie settlement','PLA','Orange',80),
  ('41000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000031','Tie lower id','PLA','Orange',50),
  ('41000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000031','Tie higher id','PLA','Orange',60),
  ('41000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000031','Exact fit settlement','PLA','Silver',80),
  ('41000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000031','Exact fit survivor','PLA','Silver',60),
  ('41000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000031','Exact fit cancellation','PLA','Silver',40),
  ('41000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000031','Maximum consumption','ABS','Green',80);

-- Privileged fixture snapshots are read only outside the restricted command assertions.
CREATE TEMP VIEW settlement_fixture_state AS
SELECT jsonb_build_object(
  'spools', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.spools s
    WHERE s.user_id IN ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000032')),
  'prints', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.prints p
    WHERE p.user_id IN ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000032')),
  'reservations', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.print_reservations r
    WHERE r.user_id IN ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000032')),
  'requests', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.request_id) FROM private.reservation_requests r
    WHERE r.user_id IN ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000032')),
  'settlements', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM private.print_settlements s
    WHERE s.user_id IN ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000032'))
) AS value;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
SELECT ok(NOT has_schema_privilege('authenticated','private','USAGE'), 'authenticated cannot use the private schema');
SELECT ok(NOT has_table_privilege('authenticated','private.print_settlements','SELECT'), 'authenticated cannot read settlement evidence directly');
SELECT ok(NOT has_table_privilege('authenticated','private.print_settlements','INSERT'), 'authenticated cannot write settlement evidence directly');
SELECT ok(NOT has_function_privilege('anon','public.settle_print_consumption(uuid,uuid,integer,uuid,numeric)','EXECUTE'), 'anonymous callers cannot execute settlement');
SELECT ok(NOT has_function_privilege('anon','public.read_print_settlement(uuid)','EXECUTE'), 'anonymous callers cannot read settlement evidence');
SELECT ok(has_function_privilege('authenticated','public.settle_print_consumption(uuid,uuid,integer,uuid,numeric)','EXECUTE'), 'authenticated callers can settle through the RPC');

SET LOCAL ROLE authenticated;

SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',1,'31000000-0000-0000-0000-000000000001','best_fit',88)->>'disposition'),'active','the completed print starts with an active reservation');
SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000002',1,'31000000-0000-0000-0000-000000000001','best_fit',66)->>'disposition'),'active','the oldest competing print is reserved');
SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000003',1,'31000000-0000-0000-0000-000000000001','best_fit',55)->>'disposition'),'active','the middle competing print is reserved');
SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000004','41000000-0000-0000-0000-000000000004',1,'31000000-0000-0000-0000-000000000001','best_fit',44)->>'disposition'),'active','the newest competing print is reserved');
SELECT set_config('test.reservation_1',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000001'),true);
SELECT set_config('test.reservation_2',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000002'),true);
SELECT set_config('test.reservation_3',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000003'),true);
SELECT set_config('test.reservation_4',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000004'),true);
SELECT set_config('test.reservation_1_expected_version',
  (SELECT version::text FROM public.prints WHERE id='41000000-0000-0000-0000-000000000001'),true);
RESET ROLE;
UPDATE public.print_reservations SET created_at = '2026-10-14 12:00:00+00' WHERE print_id = '41000000-0000-0000-0000-000000000002';
UPDATE public.print_reservations SET created_at = '2026-10-15 12:00:00+00' WHERE print_id = '41000000-0000-0000-0000-000000000003';
UPDATE public.print_reservations SET created_at = '2026-10-16 12:00:00+00' WHERE print_id = '41000000-0000-0000-0000-000000000004';
SELECT set_config('test.before_invalid_commands',(SELECT value FROM settlement_fixture_state)::text,true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000009',2,current_setting('test.reservation_1')::uuid,75)$$,
  'P0002','not_found','a caller cannot settle another owner’s print'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption(NULL,'41000000-0000-0000-0000-000000000001',2,'00000000-0000-0000-0000-000000000001',75)$$,
  '22023','invalid_settlement_request','the direct RPC rejects a missing request key'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000001',2,'00000000-0000-0000-0000-000000000001',-1)$$,
  '22023','invalid_settlement_request','the direct RPC rejects negative grams'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000001',2,'00000000-0000-0000-0000-000000000001',1.5)$$,
  '22023','invalid_settlement_request','the direct RPC rejects fractional grams'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000001',2,'00000000-0000-0000-0000-000000000001',2147483648)$$,
  '22023','invalid_settlement_request','the direct RPC rejects grams above the supported bound'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000001',2,current_setting('test.reservation_1')::uuid,NULL)$$,
  '22023','invalid_settlement_request','the direct RPC rejects null grams'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000001',2,current_setting('test.reservation_1')::uuid,'NaN'::numeric)$$,
  '22023','invalid_settlement_request','the direct RPC rejects NaN grams'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000001',2,current_setting('test.reservation_1')::uuid,'Infinity'::numeric)$$,
  '22023','invalid_settlement_request','the direct RPC rejects positive infinity grams'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000001',2,current_setting('test.reservation_1')::uuid,'-Infinity'::numeric)$$,
  '22023','invalid_settlement_request','the direct RPC rejects negative infinity grams'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000001',NULL,'00000000-0000-0000-0000-000000000001',75)$$,
  '22023','invalid_settlement_request','the direct RPC rejects a missing expected version'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000001',2,'00000000-0000-0000-0000-000000000001',75)$$,
  'P0001','reservation_changed','the direct RPC rejects a different reservation identity'
);
RESET ROLE;
SELECT is((SELECT value FROM settlement_fixture_state),current_setting('test.before_invalid_commands')::jsonb,
  'invalid commands preserve all fixture product rows, versions, timestamps and private evidence');
SET LOCAL ROLE authenticated;

SELECT set_config('test.settlement_result', public.settle_print_consumption(
  '52000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  2,
  current_setting('test.reservation_1')::uuid,
  200
)::text, true);
SELECT is((current_setting('test.settlement_result')::jsonb->>'replayed')::boolean,false,'first settlement is not a replay');
SELECT is(current_setting('test.settlement_result')::jsonb->'settlement'->>'actualGrams','200','receipt retains actual grams');
SELECT is(current_setting('test.settlement_result')::jsonb->'settlement'->>'exceededEstimate','false','consumption below recorded stock does not exceed the estimate');
SELECT is(current_setting('test.settlement_result')::jsonb->'settlement'->'spool'->>'recordedGramsBefore','300','receipt snapshots stock before settlement');
SELECT is(current_setting('test.settlement_result')::jsonb->'settlement'->'spool'->>'recordedGramsAfter','100','receipt snapshots clamped stock after settlement');
SELECT is(current_setting('test.settlement_result')::jsonb->'settlement'->'spool'->>'reservedGramsAfter','66','cancellation stops when surviving reservations fit');
SELECT is(current_setting('test.settlement_result')::jsonb->'settlement'->'spool'->>'availableGramsAfter','34','receipt records post-settlement available stock');
SELECT is(current_setting('test.settlement_result')::jsonb->'settlement'->>'releasedGrams','88','settlement releases its own 88 gram reservation');
SELECT is(
  current_setting('test.settlement_result')::jsonb->'settlement'->'cancelledReservations',
  jsonb_build_array(
    jsonb_build_object('reservationId',current_setting('test.reservation_4'),'printId','41000000-0000-0000-0000-000000000004','printName','Newest','material','PLA','colour','Black','releasedGrams',44),
    jsonb_build_object('reservationId',current_setting('test.reservation_3'),'printId','41000000-0000-0000-0000-000000000003','printName','Middle','material','PLA','colour','Black','releasedGrams',55)
  ),
  'cancellations use newest-first order and stop at the minimum prefix'
);
SELECT is((SELECT recorded_grams FROM public.spools WHERE id='31000000-0000-0000-0000-000000000001'),100::numeric,'settlement deducts actual consumption once');
SELECT is((SELECT reserved_grams FROM public.spool_inventory WHERE id='31000000-0000-0000-0000-000000000001'),66::numeric,'only the oldest reservation survives');
SELECT is((SELECT available_grams FROM public.spool_inventory WHERE id='31000000-0000-0000-0000-000000000001'),34::numeric,'surviving reservations remain covered by stock');
SELECT is((SELECT version FROM public.prints WHERE id='41000000-0000-0000-0000-000000000001'),3,'completion advances the print version once');
SELECT is((SELECT version FROM public.prints WHERE id='41000000-0000-0000-0000-000000000002'),2,'an unaffected older print version is unchanged');
SELECT is((SELECT version FROM public.prints WHERE id='41000000-0000-0000-0000-000000000003'),3,'a cancelled print version advances once');
SELECT is((SELECT version FROM public.prints WHERE id='41000000-0000-0000-0000-000000000004'),3,'each cancelled print version advances once');
RESET ROLE;
SELECT is((SELECT state FROM private.reservation_requests WHERE request_id='51000000-0000-0000-0000-000000000001'),'released','the completed reservation request is terminal');
SELECT is((SELECT state FROM private.reservation_requests WHERE request_id='51000000-0000-0000-0000-000000000003'),'released','cancelled reservation evidence is terminal');
SELECT is((SELECT state FROM private.reservation_requests WHERE request_id='51000000-0000-0000-0000-000000000002'),'active','a surviving reservation request remains active');
SET LOCAL ROLE authenticated;
SELECT is((SELECT settlement_id IS NOT NULL AND settled_at IS NOT NULL AND actual_grams=200 FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000001'),true,'completion is appended to the planned print projection');

SELECT is(
  public.settle_print_consumption('52000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',2,current_setting('test.reservation_1')::uuid,200)->'settlement',
  current_setting('test.settlement_result')::jsonb->'settlement',
  'same-key same-command replay returns the immutable original receipt'
);
SELECT is((public.settle_print_consumption('52000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',2,current_setting('test.reservation_1')::uuid,200)->>'replayed')::boolean,true,'same-key replay is identified separately');
RESET ROLE;
SELECT set_config('test.before_conflicting_replays',(SELECT value FROM settlement_fixture_state)::text,true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',2,current_setting('test.reservation_1')::uuid,199)$$,
  'P0001','idempotency_conflict','same key with changed command conflicts before current-row checks'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002',2,current_setting('test.reservation_1')::uuid,200)$$,
  'P0001','idempotency_conflict','same key with a different owned print conflicts before current-row checks'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',3,current_setting('test.reservation_1')::uuid,200)$$,
  'P0001','idempotency_conflict','same key with a different expected version conflicts before completion checks'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',2,current_setting('test.reservation_2')::uuid,200)$$,
  'P0001','idempotency_conflict','same key with a different reservation conflicts before current-row checks'
);
RESET ROLE;
SELECT is((SELECT value FROM settlement_fixture_state),current_setting('test.before_conflicting_replays')::jsonb,
  'conflicting replays preserve all fixture product rows, versions, timestamps and immutable evidence');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000099','41000000-0000-0000-0000-000000000001',2,current_setting('test.reservation_1')::uuid,75)$$,
  'P0001','already_settled','a new key cannot settle the same print again'
);
SELECT is((public.release_print_material(current_setting('test.reservation_1')::uuid,'41000000-0000-0000-0000-000000000001',current_setting('test.reservation_1_expected_version')::integer)->>'disposition'),'already_released','exact release remains idempotent after settlement');
SELECT throws_ok(
  $$SELECT public.reserve_print_material('51000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',1,'31000000-0000-0000-0000-000000000001','best_fit',88)$$,
  'P0001','reservation_request_completed','terminal reserve replay keeps its prior outcome'
);
SELECT throws_ok(
  $$SELECT public.reserve_print_material('51000000-0000-0000-0000-000000000099','41000000-0000-0000-0000-000000000001',3,'31000000-0000-0000-0000-000000000001','best_fit',88)$$,
  'P0001','print_settled','new reservations are rejected for completed prints'
);
SELECT throws_ok(
  $$SELECT public.preview_print_reservation('41000000-0000-0000-0000-000000000001')$$,
  'P0001','print_settled','reservation preview is rejected for completed prints'
);
SELECT throws_ok(
  $$SELECT public.update_print('41000000-0000-0000-0000-000000000001',3,'Edited','PLA','Black',80)$$,
  'P0001','print_settled','completed prints are rejected by the edit RPC'
);
SELECT is(public.read_print_settlement('41000000-0000-0000-0000-000000000008'),NULL::jsonb,'an existing unsettled print has no receipt');
SELECT throws_ok(
  $$SELECT public.read_print_settlement('41000000-0000-0000-0000-000000000009')$$,
  'P0002','not_found','a foreign print receipt lookup is hidden as not found'
);
SELECT throws_ok(
  $$SELECT public.read_print_settlement('41000000-0000-0000-0000-000000000099')$$,
  'P0002','not_found','a missing print receipt lookup is hidden as not found'
);

SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000005','41000000-0000-0000-0000-000000000005',1,'31000000-0000-0000-0000-000000000002','best_fit',88)->>'disposition'),'active','zero consumption fixture is reserved');
SELECT set_config('test.reservation_5',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000005'),true);
SELECT is((public.settle_print_consumption('52000000-0000-0000-0000-000000000005','41000000-0000-0000-0000-000000000005',2,current_setting('test.reservation_5')::uuid,0)->'settlement'->>'exceededEstimate'),'false','zero consumption completes without exceeding the estimate');
SELECT is((SELECT recorded_grams FROM public.spools WHERE id='31000000-0000-0000-0000-000000000002'),150::numeric,'zero consumption preserves recorded stock');
SELECT is((SELECT available_grams FROM public.spool_inventory WHERE id='31000000-0000-0000-0000-000000000002'),150::numeric,'zero consumption releases the reservation');

SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000006','41000000-0000-0000-0000-000000000006',1,'31000000-0000-0000-0000-000000000003','best_fit',88)->>'disposition'),'active','exact-estimate fixture is reserved');
SELECT set_config('test.reservation_6',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000006'),true);
SELECT is((public.settle_print_consumption('52000000-0000-0000-0000-000000000006','41000000-0000-0000-0000-000000000006',2,current_setting('test.reservation_6')::uuid,150)->'settlement'->>'exceededEstimate'),'false','consumption equal to recorded stock does not exceed the estimate');
SELECT is((SELECT recorded_grams FROM public.spools WHERE id='31000000-0000-0000-0000-000000000003'),0::numeric,'exact estimate reduces recorded stock to zero');

SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000007','41000000-0000-0000-0000-000000000007',1,'31000000-0000-0000-0000-000000000004','best_fit',88)->>'disposition'),'active','exceeded-estimate fixture is reserved');
SELECT set_config('test.reservation_7',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000007'),true);
SELECT is((public.settle_print_consumption('52000000-0000-0000-0000-000000000007','41000000-0000-0000-0000-000000000007',2,current_setting('test.reservation_7')::uuid,151)->'settlement'->>'exceededEstimate'),'true','consumption strictly above recorded stock records an exceeded-estimate warning');
SELECT is((SELECT recorded_grams FROM public.spools WHERE id='31000000-0000-0000-0000-000000000004'),0::numeric,'exceeded estimate clamps recorded stock to zero');

SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000010','41000000-0000-0000-0000-000000000010',1,'31000000-0000-0000-0000-000000000007','best_fit',88)->>'disposition'),'active','settlement tie fixture is reserved');
SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000011','41000000-0000-0000-0000-000000000011',1,'31000000-0000-0000-0000-000000000007','best_fit',55)->>'disposition'),'active','lower-ID tie reservation is active');
SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000012','41000000-0000-0000-0000-000000000012',1,'31000000-0000-0000-0000-000000000007','best_fit',66)->>'disposition'),'active','higher-ID tie reservation is active');
SELECT set_config('test.reservation_10',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000010'),true);
SELECT set_config('test.reservation_11',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000011'),true);
SELECT set_config('test.reservation_12',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000012'),true);
RESET ROLE;
UPDATE public.print_reservations SET id='52000000-0000-0000-0000-000000000011', created_at='2026-10-16 12:00:00+00' WHERE id=current_setting('test.reservation_11')::uuid;
UPDATE private.reservation_requests SET reservation_id='52000000-0000-0000-0000-000000000011' WHERE request_id='51000000-0000-0000-0000-000000000011';
UPDATE public.print_reservations SET id='52000000-0000-0000-0000-000000000012', created_at='2026-10-16 12:00:00+00' WHERE id=current_setting('test.reservation_12')::uuid;
UPDATE private.reservation_requests SET reservation_id='52000000-0000-0000-0000-000000000012' WHERE request_id='51000000-0000-0000-0000-000000000012';
SELECT set_config('test.reservation_11','52000000-0000-0000-0000-000000000011',true);
SELECT set_config('test.reservation_12','52000000-0000-0000-0000-000000000012',true);
SET LOCAL ROLE authenticated;
SELECT is((public.settle_print_consumption('52000000-0000-0000-0000-000000000010','41000000-0000-0000-0000-000000000010',2,current_setting('test.reservation_10')::uuid,175)->'settlement'->'cancelledReservations'->0->>'reservationId'),'52000000-0000-0000-0000-000000000012','equal creation timestamps use descending reservation UUID order');
SELECT is((SELECT reserved_grams FROM public.spool_inventory WHERE id='31000000-0000-0000-0000-000000000007'),55::numeric,'tie-order cancellation stops as soon as surviving reservations fit');
SELECT is((SELECT available_grams FROM public.spool_inventory WHERE id='31000000-0000-0000-0000-000000000007'),20::numeric,'tied reservation survivor remains covered by stock');
SELECT is((SELECT reservation_id FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000011'),'52000000-0000-0000-0000-000000000011'::uuid,'lower reservation ID survives the tie');
SELECT is((SELECT reservation_id FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000012'),NULL::uuid,'higher reservation ID is cancelled first');

SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000013','41000000-0000-0000-0000-000000000013',1,'31000000-0000-0000-0000-000000000008','best_fit',88)->>'disposition'),'active','exact-fit settlement is reserved');
SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000014','41000000-0000-0000-0000-000000000014',1,'31000000-0000-0000-0000-000000000008','best_fit',66)->>'disposition'),'active','exact-fit oldest reservation is active');
SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000015','41000000-0000-0000-0000-000000000015',1,'31000000-0000-0000-0000-000000000008','best_fit',44)->>'disposition'),'active','exact-fit newest reservation is active');
SELECT set_config('test.reservation_13',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000013'),true);
SELECT set_config('test.reservation_14',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000014'),true);
SELECT set_config('test.reservation_15',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000015'),true);
RESET ROLE;
UPDATE public.print_reservations SET created_at='2026-10-14 12:00:00+00' WHERE id=current_setting('test.reservation_14')::uuid;
UPDATE public.print_reservations SET created_at='2026-10-16 12:00:00+00' WHERE id=current_setting('test.reservation_15')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('test.exact_fit_result',public.settle_print_consumption('52000000-0000-0000-0000-000000000013','41000000-0000-0000-0000-000000000013',2,current_setting('test.reservation_13')::uuid,234)::text,true);
SELECT is(current_setting('test.exact_fit_result')::jsonb->'settlement'->'cancelledReservations',
  jsonb_build_array(jsonb_build_object('reservationId',current_setting('test.reservation_15'),'printId','41000000-0000-0000-0000-000000000015','printName','Exact fit cancellation','material','PLA','colour','Silver','releasedGrams',44)),
  'exact-fit cancellation releases only the newest 44 gram reservation');
SELECT is((SELECT recorded_grams FROM public.spool_inventory WHERE id='31000000-0000-0000-0000-000000000008'),66::numeric,'234 grams consumed from 300 leaves exactly 66 grams');
SELECT is((SELECT reserved_grams FROM public.spool_inventory WHERE id='31000000-0000-0000-0000-000000000008'),66::numeric,'cancellation stops at positive reserved stock exactly equal to recorded stock');
SELECT is((SELECT available_grams FROM public.spool_inventory WHERE id='31000000-0000-0000-0000-000000000008'),0::numeric,'exact-fit surviving reservation leaves zero available stock');
SELECT is((SELECT reservation_id FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000014'),current_setting('test.reservation_14')::uuid,'the exact-fit older reservation survives');
SELECT is((SELECT version FROM public.prints WHERE id='41000000-0000-0000-0000-000000000014'),2,'the exact-fit survivor version remains unchanged');
SELECT is((SELECT version FROM public.prints WHERE id='41000000-0000-0000-0000-000000000015'),3,'the exact-fit cancelled print version advances once');

SELECT is((public.reserve_print_material('51000000-0000-0000-0000-000000000016','41000000-0000-0000-0000-000000000016',1,'31000000-0000-0000-0000-000000000005','best_fit',88)->>'disposition'),'active','maximum consumption fixture is reserved');
SELECT set_config('test.reservation_16',(SELECT reservation_id::text FROM public.planned_prints WHERE id='41000000-0000-0000-0000-000000000016'),true);
SELECT set_config('test.maximum_result',public.settle_print_consumption('52000000-0000-0000-0000-000000000016','41000000-0000-0000-0000-000000000016',2,current_setting('test.reservation_16')::uuid,2147483647)::text,true);
SELECT is(current_setting('test.maximum_result')::jsonb->'settlement'->>'actualGrams','2147483647','the direct RPC accepts the inclusive maximum without rounding or overflow');
SELECT is((SELECT recorded_grams FROM public.spools WHERE id='31000000-0000-0000-0000-000000000005'),0::numeric,'maximum consumption clamps the recorded estimate at zero');

SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000008','41000000-0000-0000-0000-000000000008',1,'00000000-0000-0000-0000-000000000008',0)$$,
  'P0001','reservation_required','settlement requires a current active reservation'
);

SELECT is(public.delete_print('41000000-0000-0000-0000-000000000001')->>'id','41000000-0000-0000-0000-000000000001','completed print deletion remains allowed');
SELECT is(public.delete_spool('31000000-0000-0000-0000-000000000001')->>'id','31000000-0000-0000-0000-000000000001','spool deletion remains allowed after settlement');
SELECT is(
  public.read_print_settlement('41000000-0000-0000-0000-000000000001'),
  current_setting('test.settlement_result')::jsonb->'settlement',
  'the original receipt survives print and spool deletion'
);
SELECT throws_ok(
  $$SELECT public.settle_print_consumption('52000000-0000-0000-0000-000000000098','41000000-0000-0000-0000-000000000001',2,current_setting('test.reservation_1')::uuid,75)$$,
  'P0001','already_settled','a new key conflicts after product deletion'
);
SELECT is((public.settle_print_consumption('52000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',2,current_setting('test.reservation_1')::uuid,200)->>'replayed')::boolean,true,'same-key replay survives product deletion');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
