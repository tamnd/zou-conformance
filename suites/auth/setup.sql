-- The people the auth suite asks about.
--
-- Applied to every target before the cases run, so a recording taken
-- from GoTrue and a run against zou are answering about the same rows.
--
-- Nothing here creates the auth schema. GoTrue makes it with its own
-- migrations and zou makes it on the first connection it takes out of
-- the pool, and a suite that made a third one would be measuring its
-- own schema rather than either of theirs. So this file only writes
-- rows, and it writes them into columns both schemas have.
--
-- Every value is fixed. No now(), no gen_random_uuid(), no serial that
-- anything reads back, because an answer that is not the same twice
-- cannot be diffed. The timestamps are all distinct so that two fields
-- swapped over would show up as a difference rather than as nothing.
--
-- The password hash is a real bcrypt hash written by GoTrue 2.194.0 at
-- its own default cost for the password 'conformance-password'. Taken
-- from GoTrue rather than made here, so that the sign in cases are
-- asking whether zou can read what the reference wrote.

-- Emptied rather than upserted. A case that signs somebody up leaves a
-- row behind, and the next run has to see the database the last one
-- started with rather than the one it finished with. Order is the
-- order the foreign keys allow.
delete from auth.mfa_amr_claims;
delete from auth.refresh_tokens;
delete from auth.sessions;
delete from auth.identities;
delete from auth.one_time_tokens;
delete from auth.users;

-- The token columns are written empty rather than left null. GoTrue
-- reads every one of them into a Go string, and a null lands as
-- "converting NULL to string is unsupported" on the way out, so a row
-- with nulls in them is a row the reference cannot answer about at all.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, reauthentication_token,
  phone_change, phone_change_token,
  is_super_admin, is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  'authenticated',
  'authenticated',
  'person@zou.test',
  '$2a$10$C7LmIxiqmUbHgRmGX28dhe/kavMIs5ghXW21XXsldZjPoZtPh1qd.',
  '2026-01-01 00:00:01+00',
  '2026-01-01 00:00:02+00',
  '{"provider": "email", "providers": ["email"]}',
  '{"sub": "f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60", "email": "person@zou.test", "email_verified": true, "phone_verified": false}',
  '2026-01-01 00:00:03+00',
  '2026-01-01 00:00:04+00',
  '', '', '', '', '', '', '', '',
  false, false, false
);

-- Somebody for the admin listing to have a second row of, and for a
-- case about a user who is not the one holding the token. Confirmed at
-- a later instant than the first, since GoTrue lists newest first and
-- an order that is only right by accident is not an order.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, reauthentication_token,
  phone_change, phone_change_token,
  is_super_admin, is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  'b7e14d09-5f82-4a36-9c40-1e8b3d7a2f51',
  'authenticated',
  'authenticated',
  'other@zou.test',
  '$2a$10$C7LmIxiqmUbHgRmGX28dhe/kavMIs5ghXW21XXsldZjPoZtPh1qd.',
  '2026-01-02 00:00:01+00',
  '{"provider": "email", "providers": ["email"]}',
  '{"sub": "b7e14d09-5f82-4a36-9c40-1e8b3d7a2f51", "email": "other@zou.test", "email_verified": true, "phone_verified": false}',
  '2026-01-02 00:00:03+00',
  '2026-01-02 00:00:04+00',
  '', '', '', '', '', '', '', '',
  false, false, false
);

-- The email identity. provider_id is the user id for the email
-- provider, which is what GoTrue writes, and the email column is
-- generated from identity_data on both sides so it is not written
-- here.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
) values (
  '1d4b8f22-6c0e-4a7f-9d53-8e2b0c1a6f37',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  'email',
  '{"sub": "f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60", "email": "person@zou.test", "email_verified": true, "phone_verified": false}',
  '2026-01-01 00:00:05+00',
  '2026-01-01 00:00:06+00',
  '2026-01-01 00:00:07+00'
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
) values (
  '2e5c9033-7d1f-4b80-ae64-9f3c1d2b7a48',
  'b7e14d09-5f82-4a36-9c40-1e8b3d7a2f51',
  'b7e14d09-5f82-4a36-9c40-1e8b3d7a2f51',
  'email',
  '{"sub": "b7e14d09-5f82-4a36-9c40-1e8b3d7a2f51", "email": "other@zou.test", "email_verified": true, "phone_verified": false}',
  '2026-01-02 00:00:05+00',
  '2026-01-02 00:00:06+00',
  '2026-01-02 00:00:07+00'
);

-- The session the suite's access token belongs to. Without this row
-- every endpoint that can end a session refuses the token, and the
-- token is how most of the cases get in at all.
--
-- refresh_token_hmac_key and refresh_token_counter are left null, so
-- the session refreshes out of auth.refresh_tokens the way a session
-- made before those columns existed does.
insert into auth.sessions (
  id, user_id, created_at, updated_at, aal, not_after
) values (
  'a3f5c108-2b64-4e97-83d1-6c0a9e7b2d45',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  '2026-01-01 00:00:08+00',
  '2026-01-01 00:00:09+00',
  'aal1',
  null
);

-- How the session says it was authenticated. GoTrue writes one of
-- these per method and reads them back to work out the level a token
-- can claim.
insert into auth.mfa_amr_claims (
  id, session_id, authentication_method, created_at, updated_at
) values (
  '4a7d2f61-8c39-4e05-b2a7-0d6e1f3c5b92',
  'a3f5c108-2b64-4e97-83d1-6c0a9e7b2d45',
  'password',
  '2026-01-01 00:00:10+00',
  '2026-01-01 00:00:11+00'
);

-- The refresh token the grant_type=refresh_token cases spend. user_id
-- here is the user's id as text rather than a uuid, which is how the
-- column is declared on both sides.
insert into auth.refresh_tokens (
  instance_id, token, user_id, session_id, revoked, parent,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'zouconform01',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  'a3f5c108-2b64-4e97-83d1-6c0a9e7b2d45',
  false,
  '',
  '2026-01-01 00:00:12+00',
  '2026-01-01 00:00:13+00'
);

-- A refresh token that has already been spent, so that the case about
-- reusing one is asking about a row rather than about a typo.
insert into auth.refresh_tokens (
  instance_id, token, user_id, session_id, revoked, parent,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'zouconform02',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  'a3f5c108-2b64-4e97-83d1-6c0a9e7b2d45',
  true,
  'zouconform01',
  '2026-01-01 00:00:14+00',
  '2026-01-01 00:00:15+00'
);
