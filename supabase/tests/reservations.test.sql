BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000021', 'reservation-owner-a@example.test'),
  ('00000000-0000-0000-0000-000000000022', 'reservation-owner-b@example.test');
INSERT INTO public.spools (id,user_id,material,colour,recorded_grams) VALUES
  ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021','PLA','Black',150),
  ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000022','PLA','Black',150);
INSERT INTO public.prints (id,user_id,name,material,colour,required_grams) VALUES
  ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021','First','PLA','Black',80),
  ('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000021','Second','PLA','Black',80),
  ('40000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000022','Other owner','PLA','Black',80),
  ('40000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000021','Version guard','PLA','Black',80);

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
SET LOCAL ROLE authenticated;

SELECT ok(NOT has_table_privilege('authenticated','public.spools','INSERT'), 'authenticated cannot directly insert spools');
SELECT ok(NOT has_table_privilege('authenticated','public.spools','UPDATE'), 'authenticated cannot directly update spools');
SELECT ok(NOT has_table_privilege('authenticated','public.spools','DELETE'), 'authenticated cannot directly delete spools');
SELECT ok(NOT has_column_privilege('authenticated','public.prints','required_grams','UPDATE'), 'authenticated has no inherited print column write privilege');
SELECT ok(NOT has_table_privilege('authenticated','public.print_reservations','INSERT'), 'authenticated cannot directly insert reservations');
SELECT ok(to_regprocedure('public.reserve_print_material(uuid,uuid,integer,uuid,text)') IS NULL,
  'the historical five-argument reservation implementation is removed');
SELECT ok(to_regprocedure('public.reserve_print_material(uuid,uuid,integer,uuid,text,numeric)') IS NOT NULL,
  'the six-argument reservation RPC is installed');
SELECT ok(to_regprocedure('public.release_print_material(uuid,uuid)') IS NULL,
  'the unversioned release overload is removed');
SELECT ok(to_regprocedure('public.release_print_material(uuid,uuid,integer)') IS NOT NULL,
  'the versioned release RPC is installed');
SELECT ok(NOT has_function_privilege('anon',
  'public.reserve_print_material(uuid,uuid,integer,uuid,text,numeric)','EXECUTE'),
  'anonymous users cannot execute the reservation RPC');
SELECT ok(has_function_privilege('authenticated',
  'public.reserve_print_material(uuid,uuid,integer,uuid,text,numeric)','EXECUTE'),
  'authenticated users can execute the reservation RPC');
SELECT ok(NOT has_function_privilege('anon',
  'public.release_print_material(uuid,uuid,integer)','EXECUTE'),
  'anonymous users cannot execute the versioned release RPC');
SELECT ok(has_function_privilege('authenticated',
  'public.release_print_material(uuid,uuid,integer)','EXECUTE'),
  'authenticated users can execute the versioned release RPC');
SELECT throws_ok(
  $$INSERT INTO public.spools (user_id,material,colour,recorded_grams) VALUES (auth.uid(),'PLA','Denied',1)$$,
  '42501', 'permission denied for table spools', 'direct spool writes are denied'
);

SELECT is(public.update_print('40000000-0000-0000-0000-000000000004',1,'Newer edit','PLA','Black',90)->'recalculation',
  'null'::jsonb,'an unreserved edit returns no recalculation outcome');
SELECT throws_ok(
  $$SELECT public.update_print('40000000-0000-0000-0000-000000000004',NULL,'Stale edit','PLA','Black',80)$$,
  'P0001','edit_conflict','a NULL expected version cannot overwrite a newer print'
);
SELECT is((SELECT version FROM public.prints WHERE id='40000000-0000-0000-0000-000000000004'),2,'a rejected NULL-version edit does not advance the version');
SELECT is((SELECT required_grams FROM public.prints WHERE id='40000000-0000-0000-0000-000000000004'),90::numeric,'a rejected NULL-version edit preserves the newer requirements');
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000004',NULL,'30000000-0000-0000-0000-000000000001','best_fit',99)$$,
  'P0001','edit_conflict','a NULL reservation version is rejected before writing'
);
SELECT is((SELECT reservation_id FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000004'),NULL::uuid,'a NULL-version reservation leaves the print unreserved');

SELECT is((public.preview_print_reservation('40000000-0000-0000-0000-000000000001')->>'reservationGrams')::numeric,88::numeric,'80 grams previews as 88 with the default margin');
SELECT is(public.preview_print_reservation('40000000-0000-0000-0000-000000000001')->>'suggestedSpoolId','30000000-0000-0000-0000-000000000001','preview selects the matching spool');
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000099','40000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000001','best_fit')$$,
  'P0001','reservation_preview_required','a fresh five-argument request cannot bypass preview confirmation'
);
SELECT is((public.reserve_print_material('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000001','best_fit',88)->>'disposition'),'active','first reservation is created');
SELECT set_config('test.reservation_a',(SELECT reservation_id::text FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000001'),true);
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001','best_fit',88)$$,
  'P0001','idempotency_conflict','replay cannot replace the original expected version with NULL'
);
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000001',NULL,1,'30000000-0000-0000-0000-000000000001','best_fit',88)$$,
  'P0001','idempotency_conflict','replay cannot replace the original print with NULL'
);
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,NULL,'best_fit',88)$$,
  'P0001','idempotency_conflict','replay cannot replace the original spool with NULL'
);
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000001',NULL,88)$$,
  'P0001','idempotency_conflict','replay cannot replace the original selection mode with NULL'
);
SELECT is((SELECT reserved_grams FROM public.spool_inventory WHERE id='30000000-0000-0000-0000-000000000001'),88::numeric,'reservation total is 88 grams before the S-05 save');
SELECT is((SELECT available_grams FROM public.spool_inventory WHERE id='30000000-0000-0000-0000-000000000001'),62::numeric,'available stock is 62 grams before the S-05 save');
SELECT is((SELECT recorded_grams FROM public.spools WHERE id='30000000-0000-0000-0000-000000000001'),150::numeric,'reservation does not consume recorded stock');
SELECT lives_ok(
  $$SELECT public.update_print('40000000-0000-0000-0000-000000000001',2,'Renamed','PLA','Black',80)$$,
  'a reserved print may be saved without changing its requirements'
);
SELECT is((SELECT version FROM public.prints WHERE id='40000000-0000-0000-0000-000000000001'),3,
  'a reserved save advances the print version once');
RESET ROLE;
SELECT is((SELECT recalculated_at IS NOT NULL FROM private.reservation_requests
  WHERE request_id='50000000-0000-0000-0000-000000000001'),true,
  'a reserved save marks the original reserve request as superseded');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000001','best_fit',88)$$,
  'P0001','reservation_request_completed','an original reserve retry cannot replay after recalculation'
);
SELECT is((public.update_print('40000000-0000-0000-0000-000000000001',3,'Renamed','PLA','Black',81)->'recalculation'->>'outcome'),
  'best_fit','a requirement edit recalculates a reserved print');
SELECT is((SELECT reserved_grams FROM public.print_reservations
  WHERE print_id='40000000-0000-0000-0000-000000000001'),90::numeric,
  'a requirement edit updates the current hold');
SELECT is((SELECT version FROM public.prints WHERE id='40000000-0000-0000-0000-000000000001'),4,
  'a reserved requirement edit advances the print version exactly once');
SELECT set_config('test.reservation_a_release_version',
  (SELECT version::text FROM public.prints WHERE id='40000000-0000-0000-0000-000000000001'),true);
SELECT set_config('test.reservation_a_release_id',
  (SELECT reservation_id::text FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000001'),true);
RESET ROLE;
SELECT is((SELECT spool_id FROM private.reservation_requests
  WHERE request_id='50000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'recalculation preserves the original reserve-command spool fingerprint');
SELECT is((SELECT allocation_spool_id FROM private.reservation_requests
  WHERE request_id='50000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'request evidence tracks the current allocation spool');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.update_spool('30000000-0000-0000-0000-000000000001','PETG','Black',150)$$,
  'P0001','reserved_spool_change_requires_cancellation','a reserved spool cannot change its matching key'
);
SELECT throws_ok(
  $$SELECT public.update_spool('30000000-0000-0000-0000-000000000001','PLA','Black',87)$$,
  'P0001','stock_below_reservations','recorded stock cannot fall below active reservations'
);
SELECT lives_ok(
  $$SELECT public.update_spool('30000000-0000-0000-0000-000000000001','PLA','Black',90)$$,
  'recorded stock may equal reserved stock'
);
SELECT lives_ok(
  $$SELECT public.update_spool('30000000-0000-0000-0000-000000000001','PLA','Black',150)$$,
  'recorded stock can be restored after a valid correction'
);
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002',1,'30000000-0000-0000-0000-000000000001','best_fit',88)$$,
  'P0001','insufficient_material','a second print cannot overbook the spool'
);
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000001','best_fit',88)$$,
  'P0001','reservation_request_completed','a recalculated request cannot replay as its original allocation'
);
SELECT throws_ok(
  $$SELECT public.release_print_material(current_setting('test.reservation_a')::uuid,'40000000-0000-0000-0000-000000000002',1)$$,
  'P0002','not_found','release cannot use another owned print as its parent'
);
SELECT throws_ok(
  $$SELECT public.release_print_material(current_setting('test.reservation_a')::uuid,'40000000-0000-0000-0000-000000000003',1)$$,
  'P0002','not_found','release cannot use a foreign print as its parent'
);
SELECT throws_ok(
  $$SELECT public.release_print_material(current_setting('test.reservation_a')::uuid,'40000000-0000-0000-0000-000000000099',1)$$,
  'P0002','not_found','release cannot use an unknown print as its parent'
);
SELECT throws_ok(
  $$SELECT public.release_print_material(current_setting('test.reservation_a')::uuid,NULL,1)$$,
  'P0002','not_found','release cannot omit its parent print'
);
SELECT is((SELECT reserved_grams FROM public.spool_inventory WHERE id='30000000-0000-0000-0000-000000000001'),90::numeric,'mismatched release attempts preserve reserved stock');
SELECT is((SELECT version FROM public.prints WHERE id='40000000-0000-0000-0000-000000000001'),4,'mismatched release attempts preserve the print version');
SELECT throws_ok(
  $$SELECT public.release_print_material(current_setting('test.reservation_a')::uuid,'40000000-0000-0000-0000-000000000001',NULL)$$,
  '22023','invalid_release_request','a NULL release version cannot bypass the version check'
);
SELECT throws_ok(
  $$SELECT public.release_print_material(current_setting('test.reservation_a')::uuid,'40000000-0000-0000-0000-000000000001',0)$$,
  '22023','invalid_release_request','a nonpositive release version is invalid'
);
SELECT is((public.release_print_material(current_setting('test.reservation_a')::uuid,'40000000-0000-0000-0000-000000000001',current_setting('test.reservation_a_release_version')::integer)->>'disposition'),'released','release removes the exact reservation at its captured version');
SELECT is((public.release_print_material(current_setting('test.reservation_a')::uuid,'40000000-0000-0000-0000-000000000001',current_setting('test.reservation_a_release_version')::integer)->>'disposition'),'already_released','repeated release succeeds with its original captured version');
SELECT is((SELECT reserved_grams FROM public.spool_inventory WHERE id='30000000-0000-0000-0000-000000000001'),0::numeric,'released grams become available');
SELECT set_config('test.replacement_expected_version',
  (SELECT version::text FROM public.prints WHERE id='40000000-0000-0000-0000-000000000001'),true);
SELECT is((public.reserve_print_material('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001',current_setting('test.replacement_expected_version')::integer,'30000000-0000-0000-0000-000000000001','best_fit',90)->>'disposition'),'active','a new request may reserve the released print again at its current requirement');
SELECT set_config('test.replacement_release_version',
  (SELECT version::text FROM public.prints WHERE id='40000000-0000-0000-0000-000000000001'),true);
SELECT is((public.release_print_material(current_setting('test.reservation_a')::uuid,'40000000-0000-0000-0000-000000000001',current_setting('test.reservation_a_release_version')::integer)->>'disposition'),'already_released','a stale terminal release does not target the replacement reservation');
SELECT is((SELECT count(*)::integer FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000001' AND reservation_id IS NOT NULL),1,'stale release leaves the replacement reservation active');
SELECT is((public.release_print_material((SELECT reservation_id FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000001'),'40000000-0000-0000-0000-000000000001',current_setting('test.replacement_release_version')::integer)->>'disposition'),'released','replacement reservation is released by its own identity and captured version');
SELECT public.create_spool('PLA','Black',150);
SELECT set_config('test.manual_spool',(SELECT id::text FROM public.spools WHERE user_id=auth.uid() AND id<>'30000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1),true);
SELECT is((public.reserve_print_material('50000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000002',1,(SELECT id FROM public.spools WHERE user_id=auth.uid() AND id<>'30000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1),'manual',88)->>'disposition'),'active','eligible manual spool choice is accepted');
SELECT set_config('test.deleted_spool_release_version',
  (SELECT version::text FROM public.prints WHERE id='40000000-0000-0000-0000-000000000002'),true);
SELECT set_config('test.deleted_spool_reservation',
  (SELECT reservation_id::text FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000002'),true);
SELECT is((public.delete_spool((SELECT reservation_spool_id FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000002'))->'cancelledReservations'->0->>'releasedGrams')::numeric,88::numeric,'spool deletion reports the released reservation');
SELECT is((SELECT reservation_id FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000002'),NULL::uuid,'spool deletion leaves its print unreserved');
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000002',1,current_setting('test.manual_spool')::uuid,'manual',88)$$,
  'P0001','reservation_request_completed','a request released by deletion cannot resurrect a reservation'
);
RESET ROLE;
SELECT is((SELECT allocation_spool_id FROM private.reservation_requests
  WHERE request_id='50000000-0000-0000-0000-000000000004'),
  current_setting('test.manual_spool')::uuid,
  'current-spool evidence remains after its spool is deleted');
SET LOCAL ROLE authenticated;
SELECT is((public.release_print_material(current_setting('test.deleted_spool_reservation')::uuid,
  '40000000-0000-0000-0000-000000000002',current_setting('test.deleted_spool_release_version')::integer)->>'disposition'),
  'already_released','release after spool deletion is a terminal no-op');
SELECT throws_ok(
  $$SELECT public.preview_print_reservation('40000000-0000-0000-0000-000000000003')$$,
  'P0002','not_found','another owner cannot preview a guessed print ID'
);

SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000004',2,'30000000-0000-0000-0000-000000000001','best_fit',99);
SELECT set_config('test.deleted_print_reservation',(SELECT reservation_id::text FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000004'),true);
SELECT set_config('test.deleted_print_release_version',(SELECT version::text FROM public.prints WHERE id='40000000-0000-0000-0000-000000000004'),true);
SELECT set_config('test.print_delete_receipt',public.delete_print('40000000-0000-0000-0000-000000000004')::text,true);
SELECT is(
  current_setting('test.print_delete_receipt')::jsonb->'cancelledReservations',
  jsonb_build_array(jsonb_build_object(
    'reservationId',current_setting('test.deleted_print_reservation'),
    'printId','40000000-0000-0000-0000-000000000004',
    'printName','Newer edit','material','PLA','colour','Black','releasedGrams',99
  )),
  'reserved print deletion returns the complete cancellation summary'
);
SELECT is(
  current_setting('test.print_delete_receipt')::jsonb - 'cancelledReservations' - 'spool',
  jsonb_build_object('id','40000000-0000-0000-0000-000000000004',
    'releasedReservationId',current_setting('test.deleted_print_reservation'),'releasedGrams',99),
  'reserved print deletion retains the existing identity and release fields'
);
SELECT is(
  current_setting('test.print_delete_receipt')::jsonb->'spool',
  (SELECT to_jsonb(s) FROM public.spool_inventory s WHERE id='30000000-0000-0000-0000-000000000001'),
  'reserved print deletion retains the affected spool and its post-release stock'
);
SELECT is((public.release_print_material(current_setting('test.deleted_print_reservation')::uuid,'40000000-0000-0000-0000-000000000004',current_setting('test.deleted_print_release_version')::integer)->>'disposition'),'already_released','release remains idempotent after its parent print is deleted');
SELECT is(public.release_print_material(current_setting('test.deleted_print_reservation')::uuid,'40000000-0000-0000-0000-000000000004',current_setting('test.deleted_print_release_version')::integer)->'print','null'::jsonb,'release of a deleted print returns a null current print');
SELECT throws_ok(
  $$SELECT public.release_print_material(current_setting('test.deleted_print_reservation')::uuid,'40000000-0000-0000-0000-000000000001',1)$$,
  'P0002','not_found','retained reservation evidence still rejects another parent after deletion'
);
SELECT is((SELECT available_grams FROM public.spool_inventory WHERE id='30000000-0000-0000-0000-000000000001'),150::numeric,'repeated release after deletion preserves available stock');
SELECT is(
  public.delete_print('40000000-0000-0000-0000-000000000002'),
  jsonb_build_object('id','40000000-0000-0000-0000-000000000002','cancelledReservations','[]'::jsonb,
    'releasedReservationId',NULL,'releasedGrams',NULL,'spool',NULL),
  'unreserved print deletion returns an empty cancellation summary and null release fields'
);

SELECT set_config('test.settlement_expected_version',
  (SELECT version::text FROM public.prints WHERE id='40000000-0000-0000-0000-000000000001'),true);
SELECT is((public.reserve_print_material('50000000-0000-0000-0000-000000000008','40000000-0000-0000-0000-000000000001',current_setting('test.settlement_expected_version')::integer,'30000000-0000-0000-0000-000000000001','best_fit',90)->>'disposition'),'active','a released print can be reserved again before settlement');
SELECT set_config('test.settlement_reservation', (SELECT reservation_id::text FROM public.planned_prints WHERE id='40000000-0000-0000-0000-000000000001'), true);
SELECT set_config('test.settlement_release_version',
  (SELECT version::text FROM public.prints WHERE id='40000000-0000-0000-0000-000000000001'),true);
SELECT is((public.settle_print_consumption('50000000-0000-0000-0000-000000000009','40000000-0000-0000-0000-000000000001',current_setting('test.settlement_release_version')::integer,current_setting('test.settlement_reservation')::uuid,0)->'settlement'->>'actualGrams'),'0','zero actual consumption settles through the reservation contract');
SELECT throws_ok(
  $$SELECT public.preview_print_reservation('40000000-0000-0000-0000-000000000001')$$,
  'P0001','print_settled','a completed print cannot be previewed for another reservation'
);
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000010','40000000-0000-0000-0000-000000000001',8,'30000000-0000-0000-0000-000000000001','best_fit',88)$$,
  'P0001','print_settled','a new reservation is rejected for a completed print'
);
SELECT throws_ok(
  $$SELECT public.reserve_print_material('50000000-0000-0000-0000-000000000008','40000000-0000-0000-0000-000000000001',current_setting('test.settlement_expected_version')::integer,'30000000-0000-0000-0000-000000000001','best_fit',90)$$,
  'P0001','reservation_request_completed','terminal reserve replay precedence is preserved after settlement'
);
SELECT throws_ok(
  $$SELECT public.update_print('40000000-0000-0000-0000-000000000001',current_setting('test.settlement_release_version')::integer + 1,'Completed edit','PLA','Black',80)$$,
  'P0001','print_settled','a completed print cannot be edited'
);
SELECT is((public.release_print_material(current_setting('test.settlement_reservation')::uuid,'40000000-0000-0000-0000-000000000001',current_setting('test.settlement_release_version')::integer)->>'disposition'),'already_released','exact release remains a no-op after settlement');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
