-- The two people the phone suite starts from.
--
-- Applied to every target before the cases run, the same as every other
-- suite here, so a recording taken from GoTrue and a run against zou are
-- answering about the same rows.
--
-- Nothing here creates the auth schema. GoTrue makes it with its own
-- migrations and zou makes it on the first connection it takes out of
-- the pool, and a suite that made a third one would be measuring its own
-- schema rather than either of theirs. So this file only writes rows,
-- and it writes them into columns both schemas have.
--
-- Both accounts are a phone and nothing else: no email, no email
-- identity, no address on the identity data. That is what an account
-- made by a phone signup looks like, and it is the difference this suite
-- is about, so seeding people who also have an address would let a
-- target answer half of these cases off the wrong column.
--
-- The password hash is the same one the auth suite next door seeds, a
-- real bcrypt hash written by GoTrue at its own default cost for the
-- password 'conformance-password'. Taken from GoTrue rather than made
-- here, so the sign in cases are asking whether zou can read what the
-- reference wrote.
--
-- The numbers are all in 555 0100 through 555 0199, the range set aside
-- so that nothing in a test can ring somebody's telephone. Each one has
-- its code written down on both servers, which is what makes a suite
-- about codes possible at all: nothing here can read an sms, so no
-- number here is ever texted.

-- Emptied rather than upserted. A case that signs somebody up leaves a
-- row behind, and the next run has to see the database the last one
-- started with rather than the one it finished with. Order is the
-- order the foreign keys allow.
delete from auth.audit_log_entries;
delete from auth.mfa_amr_claims;
delete from auth.mfa_factors;
delete from auth.refresh_tokens;
delete from auth.sessions;
delete from auth.identities;
delete from auth.one_time_tokens;
delete from auth.flow_state;
delete from auth.users;

-- The person every case that needs an account already there asks about.
-- Their number is confirmed, so a password sign in by phone is allowed
-- to answer with a session rather than with a refusal about a number
-- nobody has proved.
--
-- The token columns are written empty rather than left null. GoTrue
-- reads every one of them into a Go string, and a null lands as
-- "converting NULL to string is unsupported" on the way out, so a row
-- with nulls in them is a row the reference cannot answer about at all.
insert into auth.users (
  instance_id, id, aud, role, phone, encrypted_password,
  phone_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, reauthentication_token,
  phone_change, phone_change_token,
  is_super_admin, is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  'e1c9b7a3-4d52-4f81-b6c0-9a2e5d3f7c14',
  'authenticated',
  'authenticated',
  '15550100000',
  '$2a$10$C7LmIxiqmUbHgRmGX28dhe/kavMIs5ghXW21XXsldZjPoZtPh1qd.',
  '2026-01-01 00:00:01+00',
  '2026-01-01 00:00:02+00',
  '{"provider": "phone", "providers": ["phone"]}',
  '{"sub": "e1c9b7a3-4d52-4f81-b6c0-9a2e5d3f7c14", "phone": "15550100000", "email_verified": false, "phone_verified": true}',
  '2026-01-01 00:00:03+00',
  '2026-01-01 00:00:04+00',
  '', '', '', '', '', '', '', '',
  false, false, false
);

-- Somebody whose number is taken, for the two cases about moving onto a
-- number that already belongs to an account. Confirmed at a later
-- instant than the first, so an order that is only right by accident is
-- not an order.
insert into auth.users (
  instance_id, id, aud, role, phone, encrypted_password,
  phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, reauthentication_token,
  phone_change, phone_change_token,
  is_super_admin, is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  'f2d0c8b4-5e63-4a92-97d1-0b3f6e4a8d25',
  'authenticated',
  'authenticated',
  '15550100006',
  '$2a$10$C7LmIxiqmUbHgRmGX28dhe/kavMIs5ghXW21XXsldZjPoZtPh1qd.',
  '2026-01-02 00:00:01+00',
  '{"provider": "phone", "providers": ["phone"]}',
  '{"sub": "f2d0c8b4-5e63-4a92-97d1-0b3f6e4a8d25", "phone": "15550100006", "email_verified": false, "phone_verified": true}',
  '2026-01-02 00:00:03+00',
  '2026-01-02 00:00:04+00',
  '', '', '', '', '', '', '', '',
  false, false, false
);

-- The phone identity, which is the row that says how each account can
-- be signed in to. provider_id is the user id for this provider, the
-- same as it is for email, and the email column on the table is
-- generated from identity_data on both sides so it is not written here.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
) values (
  '3a6c9d55-7e14-4b83-a2f6-1c8d0e2b5f39',
  'e1c9b7a3-4d52-4f81-b6c0-9a2e5d3f7c14',
  'e1c9b7a3-4d52-4f81-b6c0-9a2e5d3f7c14',
  'phone',
  '{"sub": "e1c9b7a3-4d52-4f81-b6c0-9a2e5d3f7c14", "phone": "15550100000", "email_verified": false, "phone_verified": true}',
  '2026-01-01 00:00:05+00',
  '2026-01-01 00:00:06+00',
  '2026-01-01 00:00:07+00'
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
) values (
  '4b7d0e66-8f25-4c94-b307-2d9e1f3c6a40',
  'f2d0c8b4-5e63-4a92-97d1-0b3f6e4a8d25',
  'f2d0c8b4-5e63-4a92-97d1-0b3f6e4a8d25',
  'phone',
  '{"sub": "f2d0c8b4-5e63-4a92-97d1-0b3f6e4a8d25", "phone": "15550100006", "email_verified": false, "phone_verified": true}',
  '2026-01-02 00:00:05+00',
  '2026-01-02 00:00:06+00',
  '2026-01-02 00:00:07+00'
);
