# 호텔 취재 리서치

일본·한국 호텔 취재 후보를 모아 관리하는 사내 웹앱 (정적 프런트 + Supabase). 설계: `docs/superpowers/specs/`.

## RLS·상태 규칙 검사

`.env`에 Supabase 키와 테스트 계정을 넣고 마이그레이션 적용 후:

    deno run -A scripts/check-rls.ts
