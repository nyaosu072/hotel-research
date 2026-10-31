# 한·일 하이엔드 숙소 취재 리서치 사이트 — 설계 스펙

작성일: 2026-11-01
상태: 사용자 검토 대기

## 1. 목적

하이엔드 고객층을 대상으로 하는 여행 미디어가 **직접 방문 취재할 호텔·리조트·료칸 후보**를 찾는 내부 도구.
지역을 고르면 그 지역의 4·5성급 또는 그에 준하는 숙소 목록이 나오고 (가격대로 좁힐 수 있음), 팀이 취재 진행 상황과 연락처를 함께 관리한다.

- 사용자: 미디어 대표와 팀원 (공개 사이트 아님)
- 성공 기준: 지역 하나를 골랐을 때 취재할 만한 숙소가 빠짐없이 나오고, 누가 어디에 연락했는지 팀이 한 화면에서 안다

## 2. 범위

포함:
- 일본, 한국 두 나라
- 숙소 유형: 호텔, 리조트, 료칸 (한국은 고급 한옥 스테이 포함, 직접 추가로)
- 로그인, 팀 공유, 취재 상태, 메모, 연락처 관리, 필터·정렬, 지도
- UI 언어: 일본어(기본), 영어 전환

제외 (나중에 필요하면 추가):
- 취재 일정 캘린더
- 예약 기능
- OTA(Booking·Agoda·Trip.com) API 연동 — 파트너 승인이 필요해서 제외. 검색 링크로 대신한다
- 크롤링 — 하지 않는다 (OTA 약관 위반, 봇 차단 우회 필요)
- 결제 카드 등록이 필요한 API — Google Places, Tripadvisor Content API 등. 무료 한도가 있어도 쓰지 않는다

## 3. 기술 구조

- 화면: 정적 사이트 (HTML / CSS / JS, 빌드 도구 없음), GitHub Pages에 배포
- 백엔드: Supabase (Auth, Postgres, Edge Functions)
- 지도: Leaflet + OpenStreetMap 타일
- 주소 → 좌표: OSM Nominatim (직접 추가 시에만, 요청 간격 1초 이상)
- 모든 외부 서비스는 무료 티어만 쓴다

## 4. 데이터 소스

| 소스 | 국가 | 역할 | 비용 |
|---|---|---|---|
| 평가 명단 CSV (직접 정리) | 일·한 | 1순위 후보. 미쉐린 키, 포브스 4·5성, 한국 공식 4·5성, 럭셔리 브랜드, 고급 숙소 회원 단체 | 무료 |
| 매체 선정 명단 CSV (직접 정리) | 일·한 | 참고 배지. 다른 매체가 이미 소개한 곳 표시 | 무료 |
| Wikidata (SPARQL) | 일·한 | 정보 보강. 공식 홈페이지, 좌표, 일·영·한 이름 | 무료, 키 없음 |
| 라쿠텐 트래블 API | 일 | 2순위 자동 발굴. 지역별 숙소, `premium`(高級ホテル/旅館) 랭킹, 최저가, 평점 | 무료 (앱 ID + accessKey) |
| 한국관광공사 TourAPI (일문·영문 서비스) | 한 | 좌표, 사진, 홈페이지, 일본어·영어 이름 | 무료 (공공데이터포털 키) |
| OTA 검색 링크 | 일·한 | 호텔마다 Booking·Agoda·Trip.com·Google Maps 바로가기 | 무료, 키 없음 |

### 4.1 평가 명단

- 일본: 정부 공식 성급 제도가 없으므로 미쉐린 키(2026년판 일본 145곳, 1~3키)와 포브스 트래블 가이드 4·5성을 기준으로 한다.
- 한국: 한국관광협회중앙회 호텔업등급관리국 공식 4·5성(5성은 2026년 2월 기준 89곳, 제주 포함. 4성 수는 구현 전 확인) + 미쉐린 키 + 포브스.
- 4성은 목록에 기본 포함하되, 필터에서 "5성급만"으로 좁힐 수 있다.
- 럭셔리 브랜드 (일·한 지점): Ritz-Carlton, St. Regis, EDITION, Bvlgari (Marriott) / Park Hyatt, Andaz (Hyatt) / Conrad, Waldorf Astoria (Hilton) / Six Senses, Regent, InterContinental (IHG) / Aman, Four Seasons, Mandarin Oriental, Peninsula / 星のや, 界 (星野リゾート). 브랜드 목록은 첫 버전 기준이며 사용자가 늘리거나 줄일 수 있다.
- 고급 숙소 회원 단체: Relais & Châteaux, Small Luxury Hotels of the World, The Leading Hotels of the World.
- 첫 버전은 각 공식 사이트를 보고 수작업으로 CSV를 만든다. 매년 발표 시즌에 갱신한다.
- CSV 열: `country, name_ja, name_en, name_ko, type, award, grade, year, homepage, address`
  - `award` 값: `michelin`, `forbes`, `kr_official`, `brand`, `membership`
  - `grade` 예: 미쉐린 `3`, 포브스 `5`, 브랜드 `Park Hyatt`, 회원 단체 `Relais & Châteaux`
- 평가 명단에는 공개 정보만 넣는다. 연락처는 넣지 않는다.

### 4.1.1 매체 선정 명단

- Condé Nast Traveler Readers' Choice Awards, Travel + Leisure World's Best Awards 등 연례 순위의 일·한 숙소.
- 후보 판정에는 쓰지 않는다. "타 매체 소개됨" 배지로만 보여준다 (이미 많이 다뤄진 곳인지 판단용).
- 별도 CSV `data/media_mentions.csv`, 열: `country, name_en, name_ja, outlet, list_name, year`

### 4.1.2 Wikidata 보강

- 호텔 이름·좌표로 Wikidata 항목을 찾아 공식 홈페이지(P856), 좌표(P625), 일·영·한 이름(label)을 가져온다.
- 비어 있는 칸만 채운다. 이미 값이 있거나 사람이 고친 칸은 건드리지 않는다.
- 이름이 비슷한 항목이 여러 개면 자동으로 채우지 않고 "확인 필요"로 남긴다.
- 유명 호텔 위주라 라쿠텐 발굴 후보는 Wikidata에 없을 수 있다. 그때는 직접 입력한다.

### 4.2 "동급" 판정 (자동 발굴)

일본 라쿠텐 결과 중 다음 하나라도 맞으면 후보:
- 라쿠텐 `premium` 랭킹에 있음
- 최저가(`hotelMinCharge`)가 자동 발굴 기준선 이상

주의: `hotelMinCharge`는 참고 최저가라서 실제 가격과 차이가 클 수 있다. 판정 보조로만 쓴다.

### 4.2.1 가격대 설정

두 가지를 따로 둔다.

1. **자동 발굴 기준선** (설정 화면, 팀 공통, DB `settings` 테이블에 저장)
   - 라쿠텐에서 어느 가격 이상을 "동급 후보"로 가져올지 정한다.
   - 기본값: 1박 1인 50,000엔. 실제 데이터를 보고 조정한다.
   - 바꾸면 다음 지역 갱신부터 적용된다.
2. **가격대 필터** (목록 화면, 사람마다 다름, 브라우저에 기억)
   - 최소·최대 가격 슬라이더 + 직접 입력. 기본값은 제한 없음.
   - 통화는 국가 탭에 따라 엔(¥) / 원(₩)으로 바뀐다.
   - 빠른 선택 버튼: 예) ¥30,000~, ¥50,000~, ¥100,000~ / ₩300,000~, ₩500,000~, ₩1,000,000~

가격 정보가 없는 호텔 (TourAPI는 가격을 주지 않음, 평가 명단·직접 추가 호텔 포함):
- 상세 패널에서 "참고 가격"을 직접 입력할 수 있다.
- 가격대 필터에 "가격 미상 포함" 체크박스를 두고 기본값은 켜짐. 그래야 한국 호텔이 필터에서 통째로 사라지지 않는다.

평가 명단에 없는데 자동 판정을 통과한 곳은 **발굴 후보** 배지를 붙인다.

### 4.3 유형 분류

라쿠텐 분류와 이름 키워드(「旅館」「宿」「リゾート」 등)로 호텔 / 리조트 / 료칸을 나눈다. 틀리면 사람이 상세 패널에서 고친다.

### 4.4 구현 전 확인할 것

- 라쿠텐 SimpleHotelSearch / HotelDetailSearch가 공식 홈페이지 URL, 전화번호를 주는지
- TourAPI 일문(JpnService)·영문(EngService) 숙박 응답 필드와 호출 한도
- 한국 공식 4성 호텔 수
- 한국 공식 등급 현황을 파일로 받을 수 있는지. 안 되면 공개된 명단을 보고 수작업으로 정리
- Wikidata에서 일·한 고급 호텔의 공식 홈페이지(P856) 채움 비율 (평가 명단 호텔 표본 20곳으로 확인)

## 5. 화면

### 5.1 로그인
- 이메일 + 비밀번호 (Supabase Auth). 회원가입은 막고, 대표가 팀원을 초대한다.

### 5.2 메인: 지역 선택 + 목록 + 지도
- 위: 국가 탭(日本 / 韓国) → 지역 선택. 일본은 都道府県 → 地域, 한국은 시·도 → 시·군·구.
- 왼쪽: 호텔 카드 목록. 오른쪽: 지도. 핀 색 = 취재 상태. 카드에 마우스를 올리면 핀이 강조된다.
- 필터: 유형, 등급(4성 이상 / 5성급만), 배지, 가격대(4.2.1), 평점, 취재 상태. 정렬: 배지, 평점, 가격.
- 휴대폰: 목록과 지도를 탭으로 전환.

### 5.3 호텔 카드 / 상세 패널 맨 위 구성
```
[호텔 이름]  🔑🔑 ★5
🌐 공식 홈페이지          ← 항상 표시
✉ 대표 메일 · ☎ 대표 전화  ← 연락처 칸, 따로 표시
```
- 홈페이지가 비어 있으면 "홈페이지 미등록" + 구글 검색 링크. 한 번 입력하면 저장된다.
- 메일이 비어 있으면 "메일 추가" 버튼. 메일은 클릭하면 복사된다.

### 5.4 호텔 상세 패널 (오른쪽에서 열림)
- 기본 정보, 사진, 주소, 객실 수(있으면), 라쿠텐 링크
- OTA 바로가기: Booking · Agoda · Trip.com · Google Maps
- 취재 상태: 候補 → 連絡済 → 取材確定 → 取材完了 / 除外
  - 홈페이지가 비어 있으면 連絡済 이상으로 넘길 수 없다
  - 連絡済로 바꾸면 마지막 연락일에 오늘 날짜가 들어간다
- 담당자 지정
- 연락처: 대표 메일·전화, 담당자 목록(이름, 부서·직책, 메일, 전화, 메모, 마지막 연락일)
- 메일 자동 찾기 버튼: 공식 홈페이지 한 페이지를 읽어 `mailto:`와 메일 형식 문자열을 후보로 보여준다. 사람이 확인하고 저장한다. 못 찾으면 "못 찾음"으로 끝난다.
- 메모: 팀 공유, 작성자와 시각 표시

### 5.5 취재 현황
- 지역과 상관없이 상태별 표. 열: 호텔, 지역, 상태, 담당자, 대표 메일, 담당자 메일, 마지막 연락일.
- CSV 내보내기.

### 5.6 직접 추가
- 이름, 주소, 유형, 홈페이지(필수), 연락처를 입력. 좌표는 주소로 자동 계산.

### 5.7 언어
- 오른쪽 위 日本語 / English 토글. 기본 일본어. 고른 언어는 브라우저에 기억한다.
- 화면 문구: `i18n/ja.json`, `i18n/en.json`.
- 한국 호텔: TourAPI 일문·영문 데이터로 이름·주소를 언어에 맞춰 보여준다.
- 일본 호텔: 라쿠텐은 일본어 데이터만 주므로 영어 모드에서도 이름·주소는 일본어. 평가 명단 호텔은 CSV의 영문명을 쓴다.

## 6. 디자인 원칙

기준: 애플·토스 같은 회사의 디자이너가 봐도 어색하지 않은 수준. 내부 도구라도 "관리자 페이지" 느낌을 내지 않는다.

- **절제**: 색은 거의 무채색. 강조색은 하나만 쓰고 상태·배지 같은 의미 있는 곳에만 쓴다. 그라데이션, 그림자 남발, 이모지 아이콘은 쓰지 않는다 (스펙 안의 이모지는 설명용이고 실제 화면에선 아이콘으로 그린다).
- **타이포그래피가 위계를 만든다**: 일본어는 Noto Sans JP 또는 시스템 폰트(Hiragino), 영어·숫자는 Inter 계열. 크기·굵기 단계는 4~5개로 제한한다. 숫자(가격, 평점)는 고정폭 숫자(tabular-nums)로 정렬한다.
- **여백과 정렬**: 8px 그리드. 카드 안 정보는 왼쪽 정렬 한 줄 기준선. 테두리보다 여백으로 구역을 나눈다.
- **사진이 주인공**: 하이엔드 숙소라 사진 품질이 곧 인상이다. 카드 사진은 같은 비율로 자르고, 없으면 회색 자리표시 대신 지역색 단색 면을 쓴다.
- **움직임은 짧고 의미 있게**: 패널 열기·닫기, 필터 결과 갱신에만 150~250ms 전환. `prefers-reduced-motion`을 존중한다.
- **상태 표시**: 취재 상태 5개는 색 + 글자 둘 다로 구분한다 (색만으로 구분하지 않음).
- **다크 모드**: 시스템 설정을 따른다.
- **반응형**: 데스크톱 우선(취재 기획은 PC에서 함), 휴대폰에서도 깨지지 않게.
- **빈 상태·로딩·오류 화면도 디자인한다**: 스켈레톤 로딩, "이 지역엔 아직 후보가 없어요" 같은 안내, "최신 아님" 표시.
- **접근성**: 키보드로 전부 조작 가능, 대비 WCAG AA 이상, 포커스 표시 유지.

구현 단계에서 프론트엔드 디자인 스킬로 시안을 먼저 만들고, 사용자 확인 후 전체 화면에 적용한다.

## 7. 데이터 모델 (Supabase Postgres)

| 테이블 | 주요 열 |
|---|---|
| `hotels` | id, country, region_code, name_ja, name_en, name_ko, type, lat, lng, address, homepage, main_email, main_phone, image_url, min_charge, review_avg, review_count, source(rakuten/tourapi/award/manual), external_id, excluded, manual_fields(jsonb), updated_by, updated_at |
| `awards` | id, hotel_id, kind(michelin/forbes/kr_official/brand/membership), grade, year |
| `media_mentions` | id, hotel_id, outlet, list_name, year |
| `research` | hotel_id(PK), status, assignee, last_contacted_at, updated_by, updated_at |
| `contacts` | id, hotel_id, name, department, email, phone, memo, last_contacted_at, updated_by, updated_at |
| `notes` | id, hotel_id, author, body, created_at |
| `region_cache` | country, region_code, refreshed_at |
| `settings` | key, value(jsonb), updated_by, updated_at — 예: `discovery_min_charge_jpy` |

- `hotels.min_charge`와 함께 `currency`(JPY/KRW), `price_source`(rakuten/manual) 열을 둔다.

- `(source, external_id)`에 유일 제약 → API 갱신 시 중복 없이 갱신
- `manual_fields`: 사람이 고친 열 이름 목록. API 갱신은 이 열들을 덮어쓰지 않는다.

## 8. 보안과 개인정보

- GitHub 저장소에는 **코드와 공개 정보(평가 명단 CSV)만** 올린다.
- 담당자 메일, 메모, 취재 상태 등은 전부 Supabase DB에만 저장한다. GitHub로는 볼 수 없다.
- 모든 테이블에 RLS를 켠다. 로그인한 팀원만 읽기·쓰기 가능. 비로그인은 아무것도 못 읽는다.
- 브라우저에는 Supabase 공개 키(anon key)만 둔다. 이 키는 공개돼도 되는 키이며 RLS가 있어야 안전하다.
- 관리자 키(service_role), 라쿠텐·TourAPI 키는 Edge Function 비밀값에만 둔다. 저장소에 커밋하지 않는다.
- `.gitignore`에 `.env`, `*.local.*`, 연락처 내보내기 CSV를 넣는다.
- 회원가입 비활성화. 초대받은 계정만 로그인.

## 9. 데이터 흐름

1. 사용자가 지역 선택 → 화면이 `region_cache` 확인
2. 마지막 갱신이 24시간 넘었으면 Edge Function `fetch-region` 호출
3. `fetch-region`이 라쿠텐(일) 또는 TourAPI(한)를 호출 → 동급 판정 → `hotels`에 upsert (사람 수정값 보존)
4. 화면은 항상 DB에서만 읽는다. 외부 API를 직접 부르지 않는다
5. 평가 명단·매체 명단 CSV는 시드 스크립트로 `hotels` + `awards` + `media_mentions`에 넣는다. 이름·주소로 기존 행과 매칭하고, 애매하면 사람이 확인할 목록으로 남긴다
5-1. 시드와 지역 갱신 뒤, 홈페이지·영문명·좌표가 빈 호텔은 Wikidata로 보강한다 (4.1.2 규칙)
6. 메일 자동 찾기는 Edge Function `find-email`이 공식 홈페이지 한 페이지만 가져와 후보를 돌려준다. DB에 바로 쓰지 않는다

## 10. 오류 처리

- API 실패: 캐시된 목록을 보여주고 "최신 아님 (마지막 갱신: 날짜)" 표시
- 호출 한도: 잠시 후 재시도. 같은 지역 갱신이 진행 중이면 중복 호출하지 않는다
- 좌표 없음: 목록에는 나오고 지도엔 "위치 없음" 표시
- 저장 실패: 입력값을 지우지 않고 오류 메시지 + 다시 시도 버튼
- 동시 수정: 마지막 저장이 이긴다. 대신 `updated_by`, `updated_at`을 보여줘서 누가 바꿨는지 안다

## 11. 테스트

- Edge Function: 라쿠텐·TourAPI 응답 샘플(JSON 파일)로 ① 동급 판정 ② 사람 수정값 보존 ③ 중복 없는 upsert를 확인하는 테스트 하나
- RLS: 비로그인 상태로 각 테이블을 읽었을 때 빈 결과가 나오는지 확인하는 스크립트
- 화면: 실제 브라우저로 로그인 → 지역 선택 → 상태 변경 → 연락처 저장 → 언어 전환 흐름을 한 번 돌린다

## 12. 파일 구조

```
index.html
app.js
style.css
i18n/ja.json
i18n/en.json
data/awards_jp.csv
data/awards_kr.csv
data/media_mentions.csv
scripts/seed.ts
scripts/enrich-wikidata.ts
supabase/migrations/*.sql
supabase/functions/fetch-region/
supabase/functions/find-email/
docs/superpowers/specs/
```

## 13. 참고 자료

- 라쿠텐 HotelRanking API: https://webservice.rakuten.co.jp/documentation/hotel-ranking
- Booking.com Demand API 요건 (제외 근거): https://developers.booking.com/demand/docs/getting-started/prerequisites
- 미쉐린 키 일본 145곳: https://www.travelvoice.jp/english/145-michelin-key-hotels-including-seven-3-michelin-keys-are-selected-in-japan-with-19-new-entries
- 한국 5성 89곳 (2026-02): https://v.daum.net/v/20260219163324369
- Wikidata SPARQL: https://query.wikidata.org/
