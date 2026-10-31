# 한·일 하이엔드 숙소 취재 리서치 사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지역을 고르면 한·일 4·5성급 및 동급 호텔·리조트·료칸 후보가 목록·지도로 나오고, 팀이 취재 상태·연락처·메모를 공유하는 내부 도구를 만든다.

**Architecture:** 빌드 없는 정적 프론트엔드(ES modules)를 GitHub Pages에 올리고, 데이터·로그인·API 호출은 Supabase(Postgres + RLS, Auth, Deno Edge Functions)가 맡는다. 외부 API는 Edge Function만 호출하고 결과를 DB에 캐시하며, 화면은 DB만 읽는다. 순수 로직(판정·병합·추출·필터)은 별도 모듈로 분리해 `deno test`로 검증한다.

**Tech Stack:** HTML/CSS/JS(ES modules), Supabase(Postgres, Auth, Edge Functions on Deno), Deno 2.x(test·script runner), Leaflet 1.9.4, OpenStreetMap 타일, OSM Nominatim, Wikidata SPARQL, 라쿠텐 트래블 API, 한국관광공사 TourAPI(JpnService·EngService)

**Spec:** `docs/superpowers/specs/2026-11-01-hotel-research-design.md`

## Global Constraints

- 결제 카드 등록이 필요한 서비스는 쓰지 않는다 (Google Places, Tripadvisor 등 금지). 모든 외부 서비스는 무료 티어.
- 크롤링 금지. 예외는 `find-email`이 공식 홈페이지 **한 페이지**만 읽는 것 하나.
- 빌드 도구 없음. 프론트엔드 의존성은 CDN의 정확한 버전으로만: `@supabase/supabase-js@2.45.4` (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm`), Leaflet `1.9.4` (cdnjs).
- 저장소에는 코드와 공개 정보만. 연락처·메모·키는 커밋 금지. `.gitignore`: `.env`, `*.local.*`, `exports/`.
- 브라우저에는 Supabase anon key만. service_role, 라쿠텐, TourAPI 키는 Edge Function secret에만.
- 모든 테이블 RLS 켬. `authenticated`만 읽기·쓰기. `anon`은 아무것도 못 읽음. 회원가입 비활성화.
- UI 기본 언어 일본어, 영어 전환. 문구는 `i18n/ja.json`, `i18n/en.json`에만.
- 취재 상태 값(코드 → ja / en): `candidate` 候補 / Candidate, `contacted` 連絡済 / Contacted, `confirmed` 取材確定 / Confirmed, `done` 取材完了 / Done, `excluded` 除外 / Excluded.
- 홈페이지가 비어 있으면 상태를 `contacted`, `confirmed`, `done`으로 바꿀 수 없다.
- `contacted`로 바꾸면 `research.last_contacted_at` = 오늘.
- 자동 발굴 기준선 기본값: `discovery_min_charge_jpy = 50000` (1박 1인).
- 가격대 필터 빠른 선택: ¥30,000~, ¥50,000~, ¥100,000~ / ₩300,000~, ₩500,000~, ₩1,000,000~. "가격 미상 포함" 기본 켜짐.
- 지역 캐시 유효기간 24시간.
- Nominatim 요청 간격 1초 이상, User-Agent에 앱 이름 명시.
- 디자인: 스펙 6절 그대로. 무채색 + 강조색 1개, 이모지 아이콘 금지, 8px 그리드, tabular-nums, 다크 모드는 시스템 설정, `prefers-reduced-motion` 존중, WCAG AA.

## Review Focus

1. **평가 명단 매칭에서 이름 표기가 다른 같은 호텔** (「パレスホテル東京」 vs "Palace Hotel Tokyo", 전각·반각, 대소문자) → 엉뚱한 호텔에 붙지 않고, 확실하지 않으면 `ambiguous`로 남아야 한다. Task 6 테스트가 고정.
2. **가격 필터를 걸었을 때 가격 없는 한국 호텔** → "가격 미상 포함"이 켜져 있으면 그대로 보여야 한다. Task 9 테스트가 고정.
3. **같은 지역 갱신 버튼을 두 번 누르거나 두 사람이 동시에 누름** → 외부 API는 한 번만 불리고 두 번째는 "갱신 중"을 받는다. Task 4 테스트가 고정.
4. **홈페이지 HTML에 든 메일 비슷한 쓰레기** (`logo@2x.png`, `&#64;` 인코딩, `mailto:` 쿼리 `?subject=`) → 이미지 파일명은 빼고, 인코딩된 메일은 풀어서, 쿼리는 떼고 돌려준다. Task 7 테스트가 고정.
5. **API 갱신이 사람이 고친 값을 덮어씀** → `manual_fields`에 든 열은 API 값으로 바뀌지 않는다. Task 3 테스트가 고정.

---

## 사전 준비 (사용자가 직접 할 일, Task 1 전에)

- Supabase 프로젝트 생성 (무료). Project URL, anon key 메모. Auth → Sign-ups 비활성화.
- 라쿠텐 웹서비스 앱 등록 → `applicationId`, `accessKey`.
- 공공데이터포털에서 한국관광공사 일문·영문 관광정보 서비스 활용 신청 → 서비스 키.
- GitHub 저장소 생성 (Pages용). 무료 플랜이면 public이어야 Pages가 됨 — 코드만 올라가므로 괜찮음 (스펙 8절).

---

### Task 1: 저장소 + DB 스키마 + RLS

**Files:**
- Create: `.gitignore`, `deno.json`, `README.md`
- Create: `supabase/migrations/20261101000000_init.sql`
- Test: `scripts/check-rls.ts`

**Interfaces:**
- Produces: 테이블 `hotels`, `awards`, `media_mentions`, `research`, `contacts`, `notes`, `region_cache`, `settings` (열은 스펙 7절 그대로) + 아래 추가 사항
  - `hotels`: `currency text check (currency in ('JPY','KRW'))`, `price_source text`, `room_count int`, `rakuten_url text`, `needs_review boolean default false`, `unique (source, external_id)`
  - `hotels.type` check `('hotel','resort','ryokan')`
  - `research.status` check (Global Constraints 5개 값), 기본 `candidate`
  - `region_cache.refreshing_until timestamptz` (Task 4 잠금용)
  - `settings` 시드 행: `('discovery_min_charge_jpy', '50000')`
  - DB 함수 `set_research_status(p_hotel_id uuid, p_status text) returns research` — 홈페이지 규칙과 `last_contacted_at` 규칙을 DB에서 강제 (화면 우회 방지). 위반 시 `raise exception 'homepage_required'`.
  - 트리거: 모든 테이블 `updated_at = now()`, `updated_by = auth.uid()`

- [ ] **Step 1: `git init`, `.gitignore`(Global Constraints 값), `deno.json`(`"tasks": {"test": "deno test -A"}`) 작성**
- [ ] **Step 2: 실패하는 RLS 검사 스크립트 작성** — `scripts/check-rls.ts`: anon key로 각 테이블 `select *` → 모두 0행이어야 통과, 아니면 테이블 이름 출력 후 `Deno.exit(1)`. 테스트 계정으로 로그인 후 `hotels` insert/select 성공해야 통과.
- [ ] **Step 3: 실행해서 실패 확인** — Run: `deno run -A scripts/check-rls.ts` / Expected: 테이블 없음 오류
- [ ] **Step 4: 마이그레이션 작성 후 적용** — Run: `supabase db push` (또는 대시보드 SQL 에디터에 붙여넣기)
- [ ] **Step 5: `set_research_status` 규칙 검사 추가** — 같은 스크립트에서 홈페이지 빈 호텔에 `contacted` → `homepage_required` 오류, 홈페이지 넣은 뒤 `contacted` → 성공하고 `last_contacted_at`이 오늘.
- [ ] **Step 6: 실행해서 통과 확인** — Expected: `RLS OK`, `status rule OK`
- [ ] **Step 7: Commit** — `git commit -m "feat: db schema with RLS and status rule"`

---

### Task 2: API 실측 (스파이크) + 응답 샘플 저장

스펙 4.4의 확인 항목을 실제 호출로 답한다. 결과가 이후 Task 3·4의 필드 이름을 정한다.

**Files:**
- Create: `scripts/probe-apis.ts`
- Create: `tests/fixtures/rakuten_simple.json`, `tests/fixtures/rakuten_detail.json`, `tests/fixtures/rakuten_ranking_premium.json`, `tests/fixtures/rakuten_area.json`, `tests/fixtures/tourapi_jpn_stay.json`, `tests/fixtures/tourapi_eng_stay.json`, `tests/fixtures/tourapi_area.json`
- Create: `docs/api-notes.md`

**Interfaces:**
- Produces: `docs/api-notes.md`에 아래 답과 실제 필드 경로
  1. 라쿠텐: 공식 홈페이지 URL 필드 유무, 전화 필드, 지역 코드 체계(middleClass/smallClass/detailClass), 호출 간격 제한
  2. TourAPI 일문·영문: 숙박 목록 엔드포인트 이름과 버전, 이름·주소·좌표·홈페이지·전화·사진 필드, 지역 코드 체계, 일 호출 한도
  3. 한국 공식 4성 호텔 수, 등급 현황 파일 제공 여부
  4. Wikidata: Task 5 평가 명단 표본 20곳 중 P856(홈페이지) 있는 곳 수
- 지역 코드 형식 확정: `jp:<middleClassCode>[:<smallClassCode>]`, `kr:<areaCode>[:<sigunguCode>]` (실측과 다르면 여기서 고치고 api-notes에 기록)

- [ ] **Step 1: 키를 `.env`에 넣고 `probe-apis.ts`로 도쿄·하코네·서울·제주 각 1회 호출, 응답을 fixtures에 저장** (응답에 개인정보 없음 확인)
- [ ] **Step 2: `docs/api-notes.md`에 위 4개 답 기록**
- [ ] **Step 3: 스펙과 다른 사실이 나오면 사용자에게 보고하고 스펙 수정 여부를 묻는다** (예: 라쿠텐에 홈페이지 필드가 없으면 "홈페이지 미등록" 비율이 높아짐)
- [ ] **Step 4: Commit** — `git commit -m "chore: api probe results and fixtures"`

---

### Task 3: 판정·분류·병합 로직

**Files:**
- Create: `supabase/functions/_shared/judge.ts`, `supabase/functions/_shared/classify.ts`, `supabase/functions/_shared/merge.ts`, `supabase/functions/_shared/types.ts`
- Test: `tests/judge_test.ts`, `tests/classify_test.ts`, `tests/merge_test.ts`

**Interfaces:**
- Consumes: Task 2 fixtures와 api-notes의 필드 경로
- Produces:
  - `types.ts`: `type HotelType = 'hotel'|'resort'|'ryokan'`, `interface HotelRow` (DB `hotels` 열과 동일, snake_case)
  - `isCandidate(h: { hotelNo: number; hotelMinCharge?: number }, opts: { minChargeJpy: number; premiumHotelNos: Set<number> }): boolean`
  - `classifyType(name: string): HotelType`
  - `mergeHotel(existing: HotelRow | null, incoming: Partial<HotelRow>): Partial<HotelRow>` — API 갱신용. `existing.manual_fields`에 든 열은 incoming 값을 버린다.
  - `fillEmpty(existing: HotelRow, incoming: Partial<HotelRow>): Partial<HotelRow>` — Wikidata용. existing 값이 null/빈 문자열이고 `manual_fields`에 없는 열만 채운다.
  - `rakutenToRow(h: unknown, regionCode: string): Partial<HotelRow>`, `tourapiToRow(jpn: unknown, eng: unknown | null, regionCode: string): Partial<HotelRow>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// judge_test.ts
assertEquals(isCandidate({hotelNo: 1, hotelMinCharge: 50000}, {minChargeJpy: 50000, premiumHotelNos: new Set()}), true);
assertEquals(isCandidate({hotelNo: 1, hotelMinCharge: 49999}, {minChargeJpy: 50000, premiumHotelNos: new Set()}), false);
assertEquals(isCandidate({hotelNo: 7, hotelMinCharge: 8000}, {minChargeJpy: 50000, premiumHotelNos: new Set([7])}), true);
assertEquals(isCandidate({hotelNo: 1}, {minChargeJpy: 50000, premiumHotelNos: new Set()}), false);
// classify_test.ts
assertEquals(classifyType("強羅花壇"), "hotel");            // 키워드 없음 → hotel (사람이 고침)
assertEquals(classifyType("あさば旅館"), "ryokan");
assertEquals(classifyType("湯宿 さか本"), "ryokan");
assertEquals(classifyType("ハレクラニ沖縄 リゾート"), "resort");
assertEquals(classifyType("Amanemu Resort"), "resort");
assertEquals(classifyType("ＲＹＯＫＡＮ ｘ"), "ryokan");      // 전각
// merge_test.ts  (Review Focus 5)
const ex = { homepage: "https://a.jp", main_email: null, manual_fields: ["homepage"] } as HotelRow;
assertEquals(mergeHotel(ex, { homepage: "https://rakuten.jp/x", min_charge: 60000 }), { min_charge: 60000 });
assertEquals(fillEmpty({ ...ex, name_en: null } as HotelRow, { name_en: "Asaba", homepage: "https://w.org" }), { name_en: "Asaba" });
assertEquals(mergeHotel(null, { name_ja: "X" }), { name_ja: "X" });
// rakutenToRow / tourapiToRow: fixtures 첫 항목으로 name_ja, lat, lng, currency("JPY"/"KRW"), source, external_id 확인
```

- [ ] **Step 2: Run `deno task test` → FAIL (모듈 없음)**
- [ ] **Step 3: 구현.** `classifyType` 키워드: ryokan = `旅館|宿|ryokan`, resort = `リゾート|resort`, 둘 다면 ryokan 우선. NFKC 정규화 후 대소문자 무시.
- [ ] **Step 4: Run `deno task test` → PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat: candidate judge, type classify, merge rules"`

---

### Task 4: Edge Function `fetch-region`

**Files:**
- Create: `supabase/functions/fetch-region/index.ts`, `supabase/functions/_shared/rakuten.ts`, `supabase/functions/_shared/tourapi.ts`, `supabase/functions/_shared/lock.ts`
- Test: `tests/lock_test.ts`, `tests/fetch_region_test.ts`

**Interfaces:**
- Consumes: Task 3 전부, `settings.discovery_min_charge_jpy`
- Produces:
  - HTTP `POST /functions/v1/fetch-region` body `{ region_code: string, force?: boolean }`, 로그인 JWT 필수
  - 응답: `200 { status: "fresh" | "refreshed", count: number }`, `202 { status: "in_progress" }`, `502 { status: "upstream_failed", refreshed_at: string | null }`
  - `fetchRakutenRegion(code: string, env): Promise<{ hotels: unknown[], premiumHotelNos: Set<number> }>`
  - `fetchTourapiRegion(code: string, env): Promise<{ jpn: unknown[], eng: unknown[] }>` (eng는 contentid로 짝지음)
  - `tryAcquire(db, regionCode: string, ttlSec: number): Promise<boolean>` — `region_cache`에 `refreshing_until < now() or null` 조건부 update, 갱신된 행이 있으면 true. `release(db, regionCode)`가 `refreshed_at = now(), refreshing_until = null`.

- [ ] **Step 1: 실패하는 테스트 작성** — 외부 호출은 fixtures를 돌려주는 가짜 fetch 주입

```ts
// lock_test.ts (Review Focus 3) — 로컬 supabase(`supabase start`)에 대해
assertEquals(await tryAcquire(db, "jp:tokyo", 120), true);
assertEquals(await tryAcquire(db, "jp:tokyo", 120), false);
// fetch_region_test.ts
// 1) refreshed_at이 1시간 전 + force 없음 → 200 fresh, 가짜 fetch 호출 0회
// 2) refreshed_at이 25시간 전 → 200 refreshed, hotels upsert 수 == fixtures 중 isCandidate 통과 수
// 3) 같은 입력 두 번 → hotels 행 수 그대로 (unique (source, external_id))
// 4) 가짜 fetch가 500 → 502 upstream_failed, 기존 hotels 그대로, refreshing_until 해제됨
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: 구현.** 핸들러 흐름: JWT 확인 → `region_cache` 읽기 → 24시간 이내이고 `force` 아니면 `fresh` → `tryAcquire` 실패면 202 → 국가별 fetch → 행 변환 → 기존 행 조회 후 `mergeHotel` → upsert → `release`. 오류 시 `finally`에서 잠금 해제. 라쿠텐 호출 사이 1초 대기(api-notes 제한이 더 엄하면 그 값).
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: 배포·비밀값 설정** — Run: `supabase secrets set RAKUTEN_APP_ID=... RAKUTEN_ACCESS_KEY=... TOURAPI_KEY=...` 후 `supabase functions deploy fetch-region` / 확인: 로그인 토큰으로 도쿄 코드 호출 → 200
- [ ] **Step 6: Commit** — `git commit -m "feat: fetch-region edge function with cache and lock"`

---

### Task 5: 평가 명단·매체 명단 CSV 작성

**Files:**
- Create: `data/awards_jp.csv`, `data/awards_kr.csv`, `data/media_mentions.csv`, `data/SOURCES.md`, `scripts/check-csv.ts`

**Interfaces:**
- Produces: 스펙 4.1·4.1.1의 열 그대로. `award` ∈ `michelin|forbes|kr_official|brand|membership`, `type` ∈ `hotel|resort|ryokan`.

- [ ] **Step 1: 미쉐린 키 2026 일본·한국, 포브스 2026 4·5성 일본·한국, 한국 공식 4·5성 명단을 각 공식 사이트에서 정리** — 공식 홈페이지 URL 같이 기록. 출처 URL과 확인 날짜는 `data/SOURCES.md`에.
- [ ] **Step 2: 브랜드(스펙 4.1 목록)와 회원 단체 3곳의 일·한 지점 정리**
- [ ] **Step 3: Condé Nast Traveler Readers' Choice, Travel + Leisure World's Best 최신판의 일·한 숙소를 `media_mentions.csv`에 정리**
- [ ] **Step 4: 검사 스크립트** — `scripts/check-csv.ts`: 헤더가 스펙과 같은지, `award`·`type` 값이 허용값뿐인지, awards CSV 모든 행에 `homepage`가 있는지. Run: `deno run -A scripts/check-csv.ts` / Expected: `CSV OK`
- [ ] **Step 5: 사용자에게 CSV 행 수와 표본 10행을 보여주고 빠진 곳이 있는지 확인받음**
- [ ] **Step 6: Commit** — `git commit -m "data: award, brand, membership, media lists"`

---

### Task 6: 시드 스크립트 + Wikidata 보강

**Files:**
- Create: `scripts/seed.ts`, `scripts/enrich-wikidata.ts`, `supabase/functions/_shared/match.ts`, `supabase/functions/_shared/wikidata.ts`
- Test: `tests/match_test.ts`, `tests/wikidata_test.ts`, `tests/fixtures/wikidata_asaba.json`

**Interfaces:**
- Consumes: Task 3 `fillEmpty`, Task 5 CSV
- Produces:
  - `normalizeName(s: string): string` — NFKC, 소문자, 공백·기호 제거 (단어는 지우지 않음)
  - `matchHotel(row: { name_ja?: string; name_en?: string; lat?: number; lng?: number }, candidates: HotelRow[]): { match: HotelRow | null; ambiguous: boolean }` — 정규화한 이름이 정확히 같은 후보가 1개면 match. 0개면 좌표 300m 이내이면서 정규화 이름이 서로 포함 관계인 후보가 정확히 1개일 때만 match. 그 조건(정확 일치 또는 포함 관계)에 맞는 후보가 2개 이상이면 `ambiguous: true`, match null.
  - `seed.ts [--dry-run]`: CSV → 매칭 → `hotels`(source `award`, 매칭 없을 때만 insert) + `awards` + `media_mentions`. ambiguous는 `needs_review = true`로 표시할 대상 목록을 콘솔에 출력하고 자동 연결하지 않음.
  - `wikidataLookup(name: string, lat?: number, lng?: number, fetchFn = fetch): Promise<{ homepage?: string; name_en?: string; name_ja?: string; name_ko?: string; lat?: number; lng?: number } | "ambiguous" | null>`
  - `enrich-wikidata.ts`: `homepage`, `name_en`, `lat` 중 하나라도 빈 호텔 → `wikidataLookup` → `fillEmpty`로만 갱신. `"ambiguous"`면 `needs_review = true`. 요청 간격 1초.

- [ ] **Step 1: 실패하는 테스트 작성** (Review Focus 1)

```ts
const rows = [
  { id: "a", name_ja: "パレスホテル東京", name_en: "Palace Hotel Tokyo", lat: 35.6847, lng: 139.7613 },
  { id: "b", name_ja: "ホテル東京", name_en: "Hotel Tokyo", lat: 35.70, lng: 139.70 },
] as HotelRow[];
assertEquals(matchHotel({ name_en: "PALACE HOTEL TOKYO" }, rows).match?.id, "a");
assertEquals(matchHotel({ name_ja: "パレスホテル東京" }, rows).match?.id, "a");
assertEquals(matchHotel({ name_en: "Tokyo" }, rows), { match: null, ambiguous: true });
assertEquals(matchHotel({ name_en: "Aman Tokyo" }, rows), { match: null, ambiguous: false });
// wikidata_test: fixture 응답(가짜 fetchFn)으로 homepage, name_en 추출; 결과 2개면 "ambiguous"; 0개면 null
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: 구현.** Wikidata SPARQL은 `https://query.wikidata.org/sparql`, `P31/P279*` 호텔(Q27686) + label 일치, 좌표가 주어지면 1km 이내로 좁힘, User-Agent 명시.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: 실제 실행** — Run: `deno run -A scripts/seed.ts --dry-run` → 매칭·신규·ambiguous 수 확인 → `deno run -A scripts/seed.ts` → `deno run -A scripts/enrich-wikidata.ts` / Expected: 오류 없이 끝나고, 홈페이지 빈 award 호텔 수가 줄어듦 (전후 수치 기록)
- [ ] **Step 6: Commit** — `git commit -m "feat: seed award lists and wikidata enrichment"`

---

### Task 7: Edge Function `find-email`

**Files:**
- Create: `supabase/functions/find-email/index.ts`, `supabase/functions/_shared/extract-emails.ts`
- Test: `tests/extract_emails_test.ts`

**Interfaces:**
- Produces:
  - `extractEmails(html: string): string[]` — 중복 제거, 소문자, 입력 순서 유지
  - HTTP `POST /functions/v1/find-email` body `{ hotel_id: string }`, JWT 필수 → `200 { emails: string[] }` (DB에 쓰지 않음). 홈페이지 없음 `400 { error: "no_homepage" }`. 가져오기 실패·타임아웃(10초) `200 { emails: [] }`.
  - 홈페이지 URL은 DB의 `hotels.homepage`에서만 읽음 (요청 바디로 URL을 받지 않음). `http(s)`만 허용, 사설 IP·localhost 거부, 응답은 1MB까지만 읽음.

- [ ] **Step 1: 실패하는 테스트 작성** (Review Focus 4)

```ts
assertEquals(extractEmails('<a href="mailto:PR@Hotel.jp?subject=Hi">x</a>'), ["pr@hotel.jp"]);
assertEquals(extractEmails('info&#64;ryokan.jp'), ["info@ryokan.jp"]);
assertEquals(extractEmails('<img src="logo@2x.png"> sales@hotel.co.jp'), ["sales@hotel.co.jp"]);
assertEquals(extractEmails('a@b.jp a@b.jp'), ["a@b.jp"]);
assertEquals(extractEmails('no email here'), []);
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: 구현.** HTML 엔티티 디코드 → `mailto:` 값(쿼리 제거) + 본문 정규식 → `png|jpe?g|gif|svg|webp|woff2?`로 끝나는 것 제외.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: 배포** — `supabase functions deploy find-email` / 확인: award 호텔 하나로 호출 → 200
- [ ] **Step 6: Commit** — `git commit -m "feat: find-email edge function"`

---

### Task 8: 디자인 시안 + 앱 뼈대 (로그인, 언어, 테마)

**Files:**
- Create: `index.html`, `style.css`, `js/app.js`, `js/supabase.js`, `js/i18n.js`, `js/auth.js`, `js/config.js` (Supabase URL + anon key — 공개 가능 값), `i18n/ja.json`, `i18n/en.json`
- Test: `tests/i18n_test.ts`

**Interfaces:**
- Produces:
  - `js/supabase.js`: `export const sb` (supabase-js client)
  - `js/i18n.js`: `t(key: string, vars?: Record<string, string | number>): string`, `setLang(lang: 'ja' | 'en'): void`, `getLang(): 'ja' | 'en'` — 기본 `ja`, `localStorage` 키 `lang` (try/catch, 실패하면 ja). 없는 키는 키 문자열 그대로 반환.
  - `style.css` `:root` 토큰: `--bg`, `--surface`, `--text`, `--text-muted`, `--line`, `--accent`, `--st-candidate`, `--st-contacted`, `--st-confirmed`, `--st-done`, `--st-excluded`, `--space-1`…`--space-6` (8px 배수), `--radius`, `--fs-1`…`--fs-5`. 다크 모드는 `@media (prefers-color-scheme: dark)`에서 재정의.
  - `js/app.js` `route()` — 해시 `#/login`, `#/`, `#/research`, `#/add`, `#/settings`. 로그인 안 됐으면 `#/login`으로.

- [ ] **Step 1: 디자인 시안** — frontend-design 스킬로 메인 화면(목록 + 지도 + 상세 패널) 정적 시안을 라이트·다크로 만든다. 실제 평가 명단 호텔 6곳 데이터로 채운다.
- [ ] **Step 2: 사용자에게 시안을 보여주고 승인받는다. 승인 전에는 다음 단계로 가지 않는다.**
- [ ] **Step 3: 실패하는 테스트 작성**

```ts
const ja = JSON.parse(await Deno.readTextFile("i18n/ja.json"));
const en = JSON.parse(await Deno.readTextFile("i18n/en.json"));
assertEquals(Object.keys(ja).sort(), Object.keys(en).sort());   // 키 누락 없음
for (const s of ["candidate", "contacted", "confirmed", "done", "excluded"]) assert(ja[`status.${s}`] && en[`status.${s}`]);
assertEquals(ja["status.contacted"], "連絡済");
assertEquals(en["status.contacted"], "Contacted");
```

- [ ] **Step 4: Run → FAIL**
- [ ] **Step 5: 구현** — 승인된 시안의 토큰으로 `style.css`, 로그인 화면(이메일 + 비밀번호, 가입 링크 없음), 상단 바(日本語 / English 토글), 라우터.
- [ ] **Step 6: Run → PASS, 브라우저 확인** — 로컬 정적 서버로 열어 로그인 → 메인 빈 화면 → 언어 전환 → 새로고침 후 언어 유지. 로그아웃 상태로 `#/` 접근 시 `#/login`으로 감.
- [ ] **Step 7: Commit** — `git commit -m "feat: app shell, auth, i18n, design tokens"`

---

### Task 9: 메인 화면 (지역 선택, 목록, 필터, 지도)

**Files:**
- Create: `js/regions.js`, `js/list.js`, `js/filters.js`, `js/map.js`, `data/regions_jp.json`, `data/regions_kr.json`
- Test: `tests/filters_test.ts`

**Interfaces:**
- Consumes: `sb`, `t`, `fetch-region` (Task 4), 지역 코드 형식 (Task 2)
- Produces:
  - `data/regions_*.json`: `[{ code: string, name_ja: string, name_en: string, children?: Region[] }]` — Task 2 지역 API 응답으로 한 번 생성해 커밋
  - `defaultFilters(): Filters`, `filterHotels(hotels: HotelView[], f: Filters): HotelView[]`, `sortHotels(hotels: HotelView[], key: 'badge' | 'rating' | 'price'): HotelView[]`
  - `interface Filters { types: HotelType[]; grade: 'all4' | 'five'; badges: string[]; priceMin: number | null; priceMax: number | null; includeUnknownPrice: boolean; ratingMin: number | null; statuses: string[] }` — 기본값: 배열은 빈 배열(= 전부), 숫자는 null, `grade: 'all4'`, `includeUnknownPrice: true`. `localStorage` 키 `filters` (try/catch).
  - `HotelView` = `hotels` 행 + `awards[]` + `media_mentions[]` + `research`
  - "5성급" 판정: award가 `michelin` 2·3키, `forbes` 5, `kr_official` 5 중 하나라도 있으면. 나머지는 4성 이상으로 취급.
  - 배지 정렬 순위: michelin 3 > 2 > 1, forbes 5 > 4, kr_official 5 > 4, membership, brand, 발굴 후보(award 없음)

- [ ] **Step 1: 실패하는 테스트 작성** (Review Focus 2)

```ts
const krNoPrice = { id: "k",  country: "KR", min_charge: null,  currency: "KRW", awards: [{ kind: "kr_official", grade: "5" }] };
const jpCheap   = { id: "j1", country: "JP", min_charge: 40000, currency: "JPY", awards: [] };
const jpLux     = { id: "j2", country: "JP", min_charge: 90000, currency: "JPY", awards: [{ kind: "michelin", grade: "3" }] };
const all = [krNoPrice, jpCheap, jpLux];
assertEquals(filterHotels(all, { ...defaultFilters(), priceMin: 50000 }).map(h => h.id), ["k", "j2"]);
assertEquals(filterHotels(all, { ...defaultFilters(), priceMin: 50000, includeUnknownPrice: false }).map(h => h.id), ["j2"]);
assertEquals(filterHotels(all, { ...defaultFilters(), grade: "five" }).map(h => h.id), ["k", "j2"]);
assertEquals(sortHotels([jpCheap, krNoPrice, jpLux], "badge").map(h => h.id), ["j2", "k", "j1"]);
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: 구현** — 국가 탭 → 지역 2단 선택 → `fetch-region` 호출(202면 "갱신 중", 502면 캐시 표시 + "최신 아님 (마지막 갱신: 날짜)") → DB 조회 → 필터·정렬 → 카드 목록(홈페이지 항상 표시, 메일 클릭 시 복사, `media_mentions`가 있으면 "타 매체 소개됨" 배지 — 판정·정렬엔 안 씀) + Leaflet 지도(핀 색 = 상태, 좌표 없으면 카드에 "위치 없음"). 카드 hover ↔ 핀 강조. 가격 슬라이더 통화는 국가 탭 따라 ¥/₩, 빠른 선택 버튼은 Global Constraints 값. 휴대폰 폭에선 목록/지도 탭. 로딩 스켈레톤, 빈 상태 문구.
- [ ] **Step 4: Run → PASS, 브라우저 확인** — 도쿄 선택 → 목록·핀 표시 → ¥50,000~ → 5성급만 → 새로고침 후 필터 유지. 갱신 버튼 연타 → 네트워크 탭에서 `fetch-region` 응답이 첫 번째만 `refreshed`, 나머지 `in_progress` 또는 `fresh`.
- [ ] **Step 5: Commit** — `git commit -m "feat: region select, hotel list, filters, map"`

---

### Task 10: 호텔 상세 패널 (상태, 연락처, 메모)

**Files:**
- Create: `js/detail.js`, `js/contacts.js`, `js/notes.js`, `js/status.js`
- Test: `tests/status_test.ts`

**Interfaces:**
- Consumes: `set_research_status` (Task 1), `find-email` (Task 7)
- Produces:
  - `canSetStatus(hotel: { homepage: string | null }, status: string): boolean` — 화면 버튼 비활성화용 (최종 강제는 DB)
  - `otaLinks(hotel: { name_en?: string | null; name_ja?: string | null; name_ko?: string | null }): { booking: string; agoda: string; trip: string; gmaps: string }` — 각 사이트 검색 URL, 쿼리는 `encodeURIComponent`, 이름은 en → ja → ko 중 처음 있는 것. gmaps는 `https://www.google.com/maps/search/?api=1&query=`.
  - 사람이 홈페이지·메일·전화·유형·참고 가격을 고치면 그 열 이름을 `hotels.manual_fields`에 추가해서 저장

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
assertEquals(canSetStatus({ homepage: null }, "contacted"), false);
assertEquals(canSetStatus({ homepage: "" }, "done"), false);
assertEquals(canSetStatus({ homepage: null }, "excluded"), true);
assertEquals(canSetStatus({ homepage: "https://a.jp" }, "confirmed"), true);
const l = otaLinks({ name_en: "Palace Hotel Tokyo", name_ja: "パレスホテル東京" });
assert(l.booking.includes(encodeURIComponent("Palace Hotel Tokyo")));
assert(l.gmaps.startsWith("https://www.google.com/maps/search/?api=1&query="));
assert(otaLinks({ name_ja: "あさば" }).agoda.includes(encodeURIComponent("あさば")));
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: 구현** — 오른쪽 패널: 이름 + 배지 / 홈페이지(없으면 "홈페이지 미등록" + 구글 검색 링크 + 입력칸) / 대표 메일·전화(없으면 "메일 추가") / OTA 링크 / 상태 선택(규칙 위반 시 비활성 + 이유, DB가 `homepage_required`를 돌려줘도 같은 안내) / 담당자 지정 / 담당자 연락처 CRUD / 메일 자동 찾기(후보 표시 → 사람이 골라 저장) / 메모(작성자·시각) / `updated_by`·`updated_at` 표시. 저장 실패 시 입력값 유지 + 다시 시도 버튼.
- [ ] **Step 4: Run → PASS, 브라우저 확인** — 홈페이지 빈 호텔에서 連絡済 불가 → 홈페이지 입력 → 連絡済 → 마지막 연락일 오늘 → 담당자 추가 → 메모 작성 → 다른 계정으로 로그인해 같은 내용 보임 → 그 지역 `force` 갱신 후 직접 넣은 홈페이지 그대로.
- [ ] **Step 5: Commit** — `git commit -m "feat: hotel detail panel with status, contacts, notes"`

---

### Task 11: 취재 현황, 직접 추가, 설정

**Files:**
- Create: `js/research.js`, `js/add.js`, `js/settings.js`, `js/csv.js`, `js/geocode.js`
- Test: `tests/csv_test.ts`

**Interfaces:**
- Produces:
  - `toCsv(rows: Record<string, unknown>[], columns: string[]): string` — RFC 4180 따옴표 처리, 줄바꿈 `\r\n`, UTF-8 BOM (엑셀에서 일본어·한국어 안 깨지게)
  - `geocode(address: string): Promise<{ lat: number; lng: number } | null>` — Nominatim, 호출 간 1초 보장
  - 취재 현황 열: 호텔, 지역, 상태, 담당자, 대표 메일, 담당자 메일, 마지막 연락일 (스펙 5.5)
  - 직접 추가: `hotels` insert, `source = 'manual'`, `external_id = crypto.randomUUID()`, 홈페이지 필수, 입력한 열 전부 `manual_fields`에
  - 설정: `discovery_min_charge_jpy` 숫자 입력 (0 이상 정수만, 그 외 저장 거부)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const csv = toCsv([{ name: '箱根 "強羅" 花壇', email: "a@b.jp" }], ["name", "email"]);
assert(csv.startsWith("﻿"));
assertEquals(csv.slice(1).split("\r\n")[0], "name,email");
assertEquals(csv.slice(1).split("\r\n")[1], '"箱根 ""強羅"" 花壇",a@b.jp');
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: 구현** — 세 화면 + CSV 내보내기(브라우저 다운로드).
- [ ] **Step 4: Run → PASS, 브라우저 확인** — 한옥 스테이 하나 직접 추가 → 지도에 핀 → 取材確定 → 취재 현황에 나옴 → CSV를 엑셀로 열어 글자 안 깨짐 → 설정에서 기준선 바꾸고 지역 `force` 갱신 → 후보 수 변화.
- [ ] **Step 5: Commit** — `git commit -m "feat: research overview, manual add, settings"`

---

### Task 12: 배포 + 전체 확인

**Files:**
- Modify: `README.md` (배포, 키 설정, 명단 갱신 방법, 팀원 초대 방법)

- [ ] **Step 1: 저장소 푸시, GitHub Pages 켜기 (main 브랜치 루트)**
- [ ] **Step 2: Supabase Auth의 Site URL·Redirect URL에 Pages 주소 추가**
- [ ] **Step 3: 저장소에 비밀 없음 확인** — Run: `git grep -nE "service_role|RAKUTEN_ACCESS_KEY=|TOURAPI_KEY=" ` / Expected: 출력 없음. 그리고 `git ls-files | grep -iE "\.env|export"` / Expected: 출력 없음.
- [ ] **Step 4: RLS 재확인** — Run: `deno run -A scripts/check-rls.ts` / Expected: `RLS OK`
- [ ] **Step 5: 배포된 사이트에서 전체 흐름 한 번** — 로그인 → 하코네 선택 → 5성급만 → 료칸 상세 → 메일 자동 찾기 → 連絡済 → 영어 전환 → 휴대폰 폭 → 다크 모드
- [ ] **Step 6: 사용자에게 주소 전달, 팀원 초대 방법 안내**
- [ ] **Step 7: Commit** — `git commit -m "docs: deploy and maintenance guide"`
