-- The rows again, put back before every case that changes them.
--
-- The same statements as setup.sql, deliberately and in full. This
-- suite's setup is rows and nothing else, since the schema belongs to
-- storage-api's migrations at one end and to zou's bootstrap at the
-- other, so there is nothing in setup.sql that a reset would want to
-- leave out. The two files are kept identical below the header, and a
-- change to one is a change to both.

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

-- One row in one of them, so that emptying a bucket has something to
-- empty and deleting a bucket that is not empty is a case at all. The
-- id is fixed for the same reason every other value here is.
--
-- There is no object of these bytes in any store behind either target.
-- That is deliberate and it is what makes this a fixture rather than
-- an upload: the questions in this suite are about the bucket surface,
-- which reads this table, and a suite that had to put bytes somewhere
-- first would be asking two things at once.
insert into storage.objects (id, bucket_id, name, metadata)
values (
  '2c0d1e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  'photos',
  'holiday/beach.txt',
  '{"size": 11, "mimetype": "text/plain"}'::jsonb
);
