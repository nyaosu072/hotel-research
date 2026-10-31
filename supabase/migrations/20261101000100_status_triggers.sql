-- 상태 규칙을 테이블 트리거로 강제 (직접 insert/update 우회 방지)

create function research_status_rule() returns trigger language plpgsql as $$
declare hp text;
begin
  if new.status in ('contacted','confirmed','done') then
    select homepage into hp from hotels where id = new.hotel_id;
    if btrim(coalesce(hp, '')) = '' then raise exception 'homepage_required'; end if;
  end if;
  if new.status = 'contacted' and (tg_op = 'INSERT' or old.status is distinct from 'contacted') then
    new.last_contacted_at = now();
  end if;
  return new;
end $$;

create trigger status_rule before insert or update on research
  for each row execute function research_status_rule();

create function hotel_homepage_rule() returns trigger language plpgsql as $$
begin
  if btrim(coalesce(new.homepage, '')) = '' and exists (
    select 1 from research where hotel_id = new.id and status in ('contacted','confirmed','done')
  ) then raise exception 'homepage_required'; end if;
  return new;
end $$;

create trigger homepage_rule before update on hotels
  for each row execute function hotel_homepage_rule();

-- 얇은 upsert 래퍼 (규칙은 트리거가 강제)
create or replace function set_research_status(p_hotel_id uuid, p_status text) returns research
language plpgsql security invoker as $$
declare r research;
begin
  if not exists (select 1 from hotels where id = p_hotel_id) then
    raise exception 'hotel_not_found';
  end if;
  insert into research (hotel_id, status) values (p_hotel_id, p_status)
  on conflict (hotel_id) do update set status = excluded.status
  returning * into r;
  return r;
end $$;
