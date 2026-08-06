-- The rows again, put back before every case that changes them.
--
-- The same statements as setup.sql, deliberately and in full. This
-- suite's setup is rows and nothing else, since the schema belongs to
-- storage-api's migrations at one end and to zou's bootstrap at the
-- other, so there is nothing in setup.sql that a reset would want to
-- leave out. The two files are kept identical below the header, and a
-- change to one is a change to both.

-- The storage schema refuses a delete that did not come from the
-- Storage API. `protect_delete` is a statement trigger on both tables
-- and it reads a setting, which is the escape hatch storage-api itself
-- uses when it deletes a row, so a fixture uses the same one rather
-- than dropping the trigger and putting it back. A fixture that
-- disabled the guard would also be a fixture that stopped noticing the
-- day the guard changed.
set storage.allow_delete_query = 'true';

-- Emptied rather than upserted. A case that makes a bucket leaves a
-- row behind, and the next run has to see the database the last one
-- started with rather than the one it finished with. Objects first,
-- because they point at buckets.
delete from storage.objects;
delete from storage.buckets;

-- Two buckets, because one of the things worth asking is whether the
-- public flag comes back the way it went in, and a flag that is the
-- same on every row proves nothing.
insert into storage.buckets (id, name, public, created_at, updated_at)
values
  ('photos', 'photos', false, '2024-01-02 03:04:05+00', '2024-01-02 03:04:05+00'),
  ('notes', 'notes', true, '2024-02-03 04:05:06+00', '2024-02-03 04:05:06+00');

-- Four rows in one of them, so that emptying a bucket has something to
-- empty, deleting a bucket that is not empty is a case at all, and a
-- listing has something to sort, page through and search. The ids are
-- fixed for the same reason every other value here is, and so are the
-- three timestamps: a listing answers them, and an answer that is not
-- the same twice cannot be diffed.
--
-- Two of the four are under the same folder, because a listing calls a
-- folder a row of its own and one folder that is not there proves
-- nothing about the ones that are. The sizes are all different so that
-- two rows swapped over would show up as a difference rather than as
-- nothing.
--
-- There is no object of these bytes in any store behind either target.
-- That is deliberate and it is what makes this a fixture rather than
-- an upload: the questions in this suite are about the bucket surface,
-- which reads this table, and a suite that had to put bytes somewhere
-- first would be asking two things at once.
insert into storage.objects
  (id, bucket_id, name, metadata, created_at, updated_at, last_accessed_at)
values
  ('2c0d1e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', 'photos', 'holiday/beach.txt',
   '{"size": 11, "mimetype": "text/plain"}'::jsonb,
   '2024-03-04 05:06:07+00', '2024-03-04 05:06:07+00', '2024-03-04 05:06:07+00'),
  ('3d1e2f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a', 'photos', 'holiday/mountain.txt',
   '{"size": 22, "mimetype": "text/plain"}'::jsonb,
   '2024-03-05 06:07:08+00', '2024-03-05 06:07:08+00', '2024-03-05 06:07:08+00'),
  ('4e2f3a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b', 'photos', 'apples.txt',
   '{"size": 33, "mimetype": "text/plain"}'::jsonb,
   '2024-03-06 07:08:09+00', '2024-03-06 07:08:09+00', '2024-03-06 07:08:09+00'),
  ('5f3a4b7c-8d9e-4f0a-9b2c-3d4e5f6a7b8c', 'photos', 'zebra.txt',
   '{"size": 44, "mimetype": "text/plain"}'::jsonb,
   '2024-03-07 08:09:10+00', '2024-03-07 08:09:10+00', '2024-03-07 08:09:10+00');
