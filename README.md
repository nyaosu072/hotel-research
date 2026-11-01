# 호텔 취재 리서치

일본·한국 호텔 취재 후보를 모아 관리하는 사내 웹앱 (정적 프런트 + Supabase). 설계: `docs/superpowers/specs/`.

## RLS·상태 규칙 검사

`.env`에 Supabase 키와 테스트 계정을 넣고 마이그레이션 적용 후:

    deno run -A scripts/check-rls.ts

## 배포

1. **프런트**: GitHub Pages, `main` 브랜치 루트에서 배포 (Settings → Pages → Deploy from branch → main / root). `js/config.js`는 `scripts/write-config.ts`로 `.env`의 공개 키(URL·anon key)에서 만든다.
2. **Supabase Auth**: Authentication → URL Configuration에서 *Site URL*을 Pages 주소(`https://<계정>.github.io/<저장소>/`)로 하고 Redirect URLs에도 같은 주소를 추가한다.
3. **마이그레이션**: `npx supabase db push`.
4. **Edge Function**: `npx supabase functions deploy fetch-region --no-verify-jwt`, `npx supabase functions deploy find-email --no-verify-jwt` (함수 안에서 JWT를 직접 검사한다).

## Edge Function 시크릿

    npx supabase secrets set RAKUTEN_APP_ID=... RAKUTEN_ACCESS_KEY=... TOURAPI_KEY=...

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 자동 주입한다. 비밀 값은 저장소에 커밋하지 않는다(`.env`는 git 제외).

## 팀원 초대

가입(sign-up)은 막혀 있다. Supabase 대시보드 → Authentication → Users → *Invite user* 또는 *Add user*로 추가한다.

## 수상 목록 갱신

1. `data/awards_jp.csv`, `data/awards_kr.csv`, `data/media_mentions.csv` 수정 (`deno run -A scripts/check-csv.ts`로 검증).
2. `deno run -A scripts/seed.ts --dry-run`으로 new / ambiguous 확인 후 `deno run -A scripts/seed.ts` (재실행해도 중복 없음).
3. `deno run -A scripts/enrich-wikidata.ts`로 좌표·홈페이지 등 빈 칸 보충.

## 라쿠텐 API

일본 지역 자동 수집은 Rakuten Travel API(`RAKUTEN_APP_ID`, `RAKUTEN_ACCESS_KEY`)가 필요하다. 키가 없으면 일본 지역 갱신은 실패(`upstream_failed`)하고 수상 목록 호텔만 보인다. 한국 지역은 TourAPI 키(`TOURAPI_KEY`)로 기존 호텔의 빈 칸만 채운다.

## 일회성 정리

`deno run -A scripts/merge-duplicates.ts` (기본 dry-run, `--apply`로 실행): 수상/수동 행과 같은 호텔인 라쿠텐 행을 한 행으로 합친다.
