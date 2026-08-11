-- The fixture the tus interop suite runs against.
--
-- Ours rather than upstream's, because nobody upstream ships a suite
-- that drives tus-js-client at a storage server. Two buckets, one
-- account, and the policies that let that account write and read what
-- it wrote. The account is seeded here rather than signed up over the
-- api, so that the suite can be pointed at a server with signups shut.
--
-- auth.users and storage.objects have to exist before this runs. zou
-- creates both on its first connection to a database, which is why the
-- harness warms the server before it says it is ready. The password
-- hash wants pgcrypto in the extensions schema.

-- The storage schema refuses a delete that did not come from the
-- storage api, so the reset uses the same escape hatch storage-api
-- itself uses.
set storage.allow_delete_query = 'true';

drop policy if exists tus_writes on storage.objects;
drop policy if exists tus_reads on storage.objects;
drop policy if exists tus_updates on storage.objects;
drop policy if exists tus_removes on storage.objects;

delete from storage.s3_multipart_uploads_parts;
delete from storage.s3_multipart_uploads;
delete from storage.objects;
delete from storage.buckets where id in ('tus', 'tus-open');
delete from auth.users where email = 'tus@zou.test';

insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) values (
    '00000000-0000-0000-0000-000000000000',
    'f0f0f0f0-0000-4000-8000-00000000f0f0',
    'authenticated',
    'authenticated',
    'tus@zou.test',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
);

-- Private, and with a ceiling well under the one the endpoint announces
-- in tus-max-size, because one of the questions is which limit answers
-- first and what it is called when it does.
insert into storage.buckets (id, name, public, file_size_limit)
values ('tus', 'tus', false, 10485760);

-- Public, for the download that carries no token at all.
insert into storage.buckets (id, name, public)
values ('tus-open', 'tus-open', true);

create policy tus_writes on storage.objects
    for insert to authenticated
    with check (bucket_id in ('tus', 'tus-open'));

create policy tus_reads on storage.objects
    for select to authenticated
    using (bucket_id in ('tus', 'tus-open'));

-- An upsert is an update on a row that is already there, so the write
-- half of the suite needs this one as well as the insert.
create policy tus_updates on storage.objects
    for update to authenticated
    using (bucket_id in ('tus', 'tus-open'))
    with check (bucket_id in ('tus', 'tus-open'));

create policy tus_removes on storage.objects
    for delete to authenticated
    using (bucket_id in ('tus', 'tus-open'));
