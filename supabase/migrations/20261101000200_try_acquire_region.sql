-- 지역 갱신 잠금: 원자적 획득 (Task 4). service_role 전용.
create function try_acquire_region(p_country text, p_code text, p_ttl int) returns boolean
language plpgsql as $$
declare n int;
begin
  insert into region_cache (country, region_code) values (p_country, p_code) on conflict do nothing;
  update region_cache set refreshing_until = now() + make_interval(secs => p_ttl)
   where country = p_country and region_code = p_code
     and (refreshing_until is null or refreshing_until < now());
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function try_acquire_region(text, text, int) from public, anon, authenticated;
grant execute on function try_acquire_region(text, text, int) to service_role;
