-- The rows the anonymous suite starts from, which is none of them.
--
-- Applied to every target before the cases run, the same as every other
-- suite here. What is different is that there is nothing to seed: an
-- anonymous account cannot be written into a fixture in a way that means
-- anything, since what makes it interesting is the session it was handed
-- at the moment it was made. So this file empties the tables and stops,
-- and every case runs against an account that did not exist when the run
-- began.
--
-- Nothing here creates the auth schema. GoTrue makes it with its own
-- migrations and zou makes it on the first connection it takes out of
-- the pool, and a suite that made a third one would be measuring its own
-- schema rather than either of theirs.

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
