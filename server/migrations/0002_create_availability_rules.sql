-- Weekly availability windows for professionals, in the professional's local time.
-- day_of_week: 0 = Sunday ... 6 = Saturday. Run once in the Supabase SQL editor.
create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.users (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create index if not exists availability_rules_professional_id_idx
  on public.availability_rules (professional_id);

-- Replaces a professional's whole weekly schedule in one transaction. The row lock on
-- users serializes concurrent replacements for the same professional.
create or replace function public.replace_availability_rules(p_professional_id uuid, p_rules jsonb)
returns setof public.availability_rules
language plpgsql
as $$
begin
  perform 1 from public.users where id = p_professional_id for update;
  if not found then
    raise exception 'professional % not found', p_professional_id;
  end if;

  delete from public.availability_rules where professional_id = p_professional_id;

  insert into public.availability_rules (professional_id, day_of_week, start_time, end_time)
  select p_professional_id,
         (rule->>'day_of_week')::smallint,
         (rule->>'start_time')::time,
         (rule->>'end_time')::time
  from jsonb_array_elements(p_rules) as rule;

  return query
    select * from public.availability_rules where professional_id = p_professional_id;
end;
$$;

-- Only the server (service role key) may replace schedules; not anon or signed-in clients.
revoke all on function public.replace_availability_rules(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_availability_rules(uuid, jsonb) to service_role;
