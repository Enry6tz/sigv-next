-- Los datos personales del alta pública se conservan desde Supabase Auth.
-- El rol inicial siempre es pasajero; este trigger no lee roles de metadatos del cliente.
create unique index if not exists sigv_profiles_document_unique
  on public.profiles (upper(btrim(document)))
  where nullif(btrim(document), '') is not null;

create or replace function public.sigv_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, email, name, document, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    trim(concat_ws(' ', new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'last_name')),
    nullif(btrim(new.raw_user_meta_data ->> 'document'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  );
  insert into public.user_roles(user_id, role) values (new.id, 'pasajero');
  return new;
end;
$$;
