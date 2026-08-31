-- The rows again, put back before every case that changes them.
--
-- The same statements as setup.sql, deliberately and in full. This
-- suite's setup is rows and nothing else, since the schema belongs to
-- GoTrue's migrations at one end and to zou's bootstrap at the other,
-- so there is nothing in setup.sql that a reset would want to leave
-- out. The two files are kept identical below the header, and a change
-- to one is a change to both.

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
