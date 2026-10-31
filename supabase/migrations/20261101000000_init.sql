-- 호텔 취재 리서치: 스키마 + RLS + 상태 규칙 (spec 7, 8절)

create table hotels (
  id uuid primary key default gen_random_uuid(),
  country text not null check (country in ('JP','KR')),
  region_code text,
  name_ja text, name_en text, name_ko text,
  type text check (type in ('hotel','resort','ryokan')),
  lat double precision, lng double precision,
  address text, homepage text, main_email text, main_phone text, image_url text,
  min_charge numeric,
  currency text check (currency in ('JPY','KRW')),
  price_source text check (price_source in ('rakuten','manual')),
  review_avg numeric, review_count int, room_count int,
  rakuten_url text,
  source text not null check (source in ('rakuten','tourapi','award','manual')),
  external_id text,
  excluded boolean not null default false,
  needs_review boolean not null default false,
  manual_fields jsonb not null default '[]',
  updated_by uuid, updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create table awards (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  kind text not null check (kind in ('michelin','forbes','kr_official','brand','membership')),
  grade text, year int
);

create table media_mentions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  outlet text, list_name text, year int
);

create table research (
  hotel_id uuid primary key references hotels(id) on delete cascade,
  status text not null default 'candidate'
    check (status in ('candidate','contacted','confirmed','done','excluded')),
  assignee text,
  last_contacted_at timestamptz,
  updated_by uuid, updated_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  name text, department text, email text, phone text, memo text,
  last_contacted_at timestamptz,
  updated_by uuid, updated_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  author uuid default auth.uid(),
  body text not null,
  created_at timestamptz not null default now()
);

create table region_cache (
  country text not null,
  region_code text not null,
  refreshed_at timestamptz,
  refreshing_until timestamptz, -- 갱신 잠금 (Task 4)
  primary key (country, region_code)
);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid, updated_at timestamptz not null default now()
);

insert into settings (key, value) values ('discovery_min_charge_jpy', '50000');

-- updated_at / updated_by 트리거 (해당 열이 있는 테이블만)
create function set_audit() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

create trigger audit before insert or update on hotels   for each row execute function set_audit();
create trigger audit before insert or update on research for each row execute function set_audit();
create trigger audit before insert or update on contacts for each row execute function set_audit();
create trigger audit before insert or update on settings for each row execute function set_audit();

-- RLS: 로그인한 사용자만. anon은 권한 자체를 회수.
do $$
declare t text;
begin
  foreach t in array array['hotels','awards','media_mentions','research','contacts','notes','region_cache','settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('create policy "auth all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- 상태 변경 규칙을 DB에서 강제 (화면 우회 방지)
create function set_research_status(p_hotel_id uuid, p_status text) returns research
language plpgsql security invoker as $$
declare
  hp text;
  r research;
begin
  select homepage into hp from hotels where id = p_hotel_id;
  if not found then raise exception 'hotel_not_found'; end if;
  if p_status in ('contacted','confirmed','done') and coalesce(hp, '') = '' then
    raise exception 'homepage_required';
  end if;
  insert into research (hotel_id, status, last_contacted_at)
  values (p_hotel_id, p_status, case when p_status = 'contacted' then now() end)
  on conflict (hotel_id) do update set
    status = excluded.status,
    last_contacted_at = case when p_status = 'contacted' then now() else research.last_contacted_at end
  returning * into r;
  return r;
end $$;

revoke execute on function set_research_status(uuid, text) from public, anon;
grant execute on function set_research_status(uuid, text) to authenticated;
