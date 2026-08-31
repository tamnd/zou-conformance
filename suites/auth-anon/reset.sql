-- The empty tables again, put back in front of every case that is not a
-- continuation of the one before it.
--
-- The same statements as setup.sql, deliberately and in full, the same
-- as in the auth suite next door. There is nothing in that file a reset
-- would want to leave out, because the whole of it is rows and this
-- suite seeds none.
--
-- Almost every case here is chained and so never sees this file. The two
-- that are not are the settings read at the top, which nothing has
-- written before, and the first signup, which has to start from an empty
-- table for the accounts a later case lists to be the ones it made.

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
