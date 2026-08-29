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

-- Two more sessions for the first person and one for the second, so
-- that a logout has something to be narrow about. With a single session
-- in the database every scope does the same thing and the answer is 204
-- either way, and the difference between them is which rows are still
-- there afterwards.
--
-- Nothing reads these over http directly. What reads them is the
-- refresh token hanging off each one, which is the only way to ask from
-- outside whether a session is still alive: a session that was deleted
-- takes its refresh tokens with it, and spending one afterwards is the
-- question 'is it still there' with an answer a case can compare.
--
-- The one on the second account is there so that a global logout has
-- somebody to leave alone. A logout that deleted every session in the
-- database would pass every case that only looks at the person doing
-- it.
insert into auth.sessions (
  id, user_id, created_at, updated_at, aal, not_after
) values (
  'b8c6d219-3a75-4f08-94e2-7d1b0f8c3e56',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  '2026-01-01 00:00:23+00',
  '2026-01-01 00:00:24+00',
  'aal1',
  null
), (
  'c9d7e320-4b86-4a19-a5f3-8e2c1a9d4f67',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  '2026-01-01 00:00:27+00',
  '2026-01-01 00:00:28+00',
  'aal1',
  null
), (
  'd0e8f431-5c97-4b20-b604-9f3d2b0e5a78',
  'b7e14d09-5f82-4a36-9c40-1e8b3d7a2f51',
  '2026-01-02 00:00:08+00',
  '2026-01-02 00:00:09+00',
  'aal1',
  null
);

-- One claim each, the same shape the first session has, so that a
-- refresh spent against any of them mints the same kind of token and a
-- difference between two of these cases is about the session rather
-- than about how it says it was authenticated.
insert into auth.mfa_amr_claims (
  id, session_id, authentication_method, created_at, updated_at
) values (
  '5b8e3a72-9d40-4f16-a3b8-1e7f2a4d6c03',
  'b8c6d219-3a75-4f08-94e2-7d1b0f8c3e56',
  'password',
  '2026-01-01 00:00:25+00',
  '2026-01-01 00:00:26+00'
), (
  '6c9f4b83-0e51-4a27-b4c9-2f8a3b5e7d14',
  'c9d7e320-4b86-4a19-a5f3-8e2c1a9d4f67',
  'password',
  '2026-01-01 00:00:29+00',
  '2026-01-01 00:00:30+00'
), (
  '7d0a5c94-1f62-4b38-85da-3a9b4c6f8e25',
  'd0e8f431-5c97-4b20-b604-9f3d2b0e5a78',
  'password',
  '2026-01-02 00:00:10+00',
  '2026-01-02 00:00:11+00'
);

-- One live refresh token per extra session. These are what the cases
-- after a logout spend, and which of them still answers is the whole of
-- what the scopes differ by.
insert into auth.refresh_tokens (
  instance_id, token, user_id, session_id, revoked, parent,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'zouconform03',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  'b8c6d219-3a75-4f08-94e2-7d1b0f8c3e56',
  false,
  '',
  '2026-01-01 00:00:31+00',
  '2026-01-01 00:00:32+00'
), (
  '00000000-0000-0000-0000-000000000000',
  'zouconform04',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  'c9d7e320-4b86-4a19-a5f3-8e2c1a9d4f67',
  false,
  '',
  '2026-01-01 00:00:33+00',
  '2026-01-01 00:00:34+00'
), (
  '00000000-0000-0000-0000-000000000000',
  'zouconform05',
  'b7e14d09-5f82-4a36-9c40-1e8b3d7a2f51',
  'd0e8f431-5c97-4b20-b604-9f3d2b0e5a78',
  false,
  '',
  '2026-01-02 00:00:12+00',
  '2026-01-02 00:00:13+00'
);

-- Three entries in the audit trail, so that the listing has something
-- to page through, something to filter out, and both shapes of actor.
--
-- The payload keys are written in the order Go writes them, which is
-- alphabetical, because upstream reads the column into a map and
-- marshals it out again and a map writes its keys sorted. The order is
-- the answer's rather than the row's on both sides, but a row that
-- already agrees is one less thing in a diff.
--
-- The third entry is an admin acting on somebody else's account. Its
-- actor is the synthetic one upstream uses for that, the nil uuid under
-- the name of the role, and its log_type is the other family, so the
-- filter cases have a row to leave out as well as rows to find.
--
-- Only the second one has an empty ip_address, which is the column
-- upstream leaves empty on everything except the factor and identity
-- events, so the trail carries both a filled one and an empty one.
insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) values
(
  '00000000-0000-0000-0000-000000000000',
  '9f2c1a70-5d84-4b31-9e62-7a0c3f5d8e14',
  '{"action":"login","actor_id":"f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60","actor_username":"person@zou.test","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}',
  '2026-01-01 00:00:16+00',
  '198.51.100.7'
),
(
  '00000000-0000-0000-0000-000000000000',
  'c48b6e29-3f17-4a5d-8b90-1e7d2c4a6f38',
  '{"action":"logout","actor_id":"f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60","actor_username":"person@zou.test","actor_via_sso":false,"log_type":"account"}',
  '2026-01-01 00:00:17+00',
  ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '2d5e8b14-7c60-4f92-a3d8-5b1f0e9c7a26',
  '{"action":"user_modified","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"user_email":"person@zou.test","user_id":"f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60","user_phone":""}}',
  '2026-01-01 00:00:18+00',
  ''
);

-- Two second factors on the first account, so the admin factor listing
-- has an order to keep and two rows to rename and delete one of, and
-- none on the second, so there is an account whose list is empty rather
-- than missing.
--
-- Both are unverified, and that is not for want of a verified one to
-- look at. An account with a verified factor is behind AAL2 for its own
-- email and password changes, so a verified row here would turn the
-- case about changing a password into a case about that refusal
-- instead. It is a real difference and it is worth a case, on the
-- endpoint it belongs to rather than on this one.
--
-- Both are totp because that is the only kind a factor can have without
-- a phone number or a credential blob, and the point of the rows is the
-- listing rather than the enrolment. The secrets are the two base32
-- strings every totp library's own tests use, so nothing here looks
-- like somebody's real key.
insert into auth.mfa_factors (
  id, user_id, friendly_name, factor_type, status,
  created_at, updated_at, secret
) values (
  '6b3e0d47-9a21-4c86-b5f0-3d7c8e1a2b59',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  'the-one-in-use',
  'totp',
  'unverified',
  '2026-01-01 00:00:19+00',
  '2026-01-01 00:00:20+00',
  'JBSWY3DPEHPK3PXP'
), (
  '7c4f1e58-0b32-4d97-a6a1-4e8d9f2b3c60',
  'f0a2c7d4-9b31-4e58-8c76-2a5d1e3f4b60',
  'the-one-half-set-up',
  'totp',
  'unverified',
  '2026-01-01 00:00:21+00',
  '2026-01-01 00:00:22+00',
  'KRSXG5CTMVRXEZLU'
);
