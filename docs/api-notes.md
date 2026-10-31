# API 실측 노트 (Task 2, 2026-11-01)

실제 호출 결과. 응답 샘플은 `tests/fixtures/`, 재현은 `deno run -A scripts/probe-apis.ts`.

## 확정 지역 코드 형식 (스펙과 다름)

- **일본**: `jp:<middleClassCode>:<smallClassCode>[:<detailClassCode>]` — 예 `jp:kanagawa:hakone`, `jp:tokyo:tokyo:A`
  - 라쿠텐 SimpleHotelSearch는 middle만으로는 검색 불가(400). small까지 필수. `tokyo/tokyo`(도쿄23구)만 detail(`A`~`I`)도 필수.
  - 코드는 로마자 슬러그(`tokyo`, `kanagawa`, `hakone`)이며 일부 철자가 특이함(`hukuoka`, `tiba`, `hukushima`). 목록은 GetAreaClass가 정답.
- **한국**: `kr:<lDongRegnCd>[:<lDongSignguCd>]` — 예 `kr:11`(서울), `kr:50`(제주), `kr:50:130`(서귀포)
  - 스펙의 `areaCode/sigunguCode` 대신 **법정동 코드(lDongRegnCd/lDongSignguCd)** 를 쓴다. 이유: 2025년 이후 등록 숙소는 `areacode`가 빈 문자열이라 `areaCode=1` 필터는 서울 33건, `lDongRegnCd=11`은 38건(누락 5건). 제주는 `areacode` 빈 항목이 더 많음.
  - 주의: 두 코드 체계는 값이 다름(서울 areaCode=1 vs lDong=11, 제주 39 vs 50). 세종은 lDong 코드가 `36110`(시도+시군구 합쳐진 형태).

## 1. 라쿠텐 트래블

- **인증**: 엔드포인트 `https://openapi.rakuten.co.jp/engine/api/Travel/...`, 쿼리 `applicationId` + `accessKey`. **`Origin: https://nyaosu072.github.io` 헤더가 반드시 필요.** 없거나 `Referer`만 보내면 403 `REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING`. `Origin`만 있어도 200. (Edge Function은 서버라 Origin을 직접 붙여야 함.) accessKey를 Bearer 헤더로 보내는 건 실패(400).
- **버전**: GetAreaClass `20140210`, SimpleHotelSearch / HotelDetailSearch / HotelRanking `20170426`. (`GetAreaClass/20131024`는 "API Configuration not found")
- **호출 간격**: 문서상 1 req/s. 동시 4건 버스트 시 429 발생. 호출 사이 ≥1.1초 유지. `hits` 최대 30, 페이지는 `page`.
- **공식 홈페이지 URL 필드: 없음.** `hotelInformationUrl`/`planListUrl`/`reviewUrl`은 전부 라쿠텐 트래블 리다이렉트 링크. HotelDetailSearch 응답도 `hotelBasicInfo` + `hotelRatingInfo`뿐이며 홈페이지 필드 추가 없음.
- **전화**: `hotelBasicInfo.telephoneNo` (팩스 `faxNo`). 주소: `address1`(도도부현) + `address2`, 우편번호 `postalCode`.
- **좌표**: 기본은 도쿄측지계 밀리초 값(예 `128433.61`). **`datumType=1` 을 붙이면 WGS84 도(위도 35.22…, 경도 139.09…)**. 반드시 붙일 것.
- **응답 경로**: `hotels[].hotel[0].hotelBasicInfo` (id `hotelNo`, 이름 `hotelName`/`hotelKanaName`, 최저가 `hotelMinCharge`, 리뷰 `reviewCount`/`reviewAverage`, 이미지 `hotelImageUrl`/`hotelThumbnailUrl`, 역 `nearestStation`). 평점 세부는 `hotels[].hotel[1].hotelRatingInfo`(detail 검색에서만). 페이징 `pagingInfo.recordCount/pageCount/page`. `userReview`는 익명 후기 본문(개인정보 없음 확인).
- **지역 코드**: GetAreaClass 계층 `largeClasses[].largeClass.middleClasses[].middleClass.smallClasses[].smallClass.detailClasses[].detailClass`. japan 아래 middle 47개(도도부현). 하코네 = `kanagawa/hakone`(367건), 도쿄23구 = `tokyo/tokyo/{A..I}`, 도쿄 서부 `tokyo/nishi`(133건).
- **HotelRanking genre=premium: 데이터가 2014년에 멈춤.** `lastBuildDate: 20141102…`, 후기도 2014년. 쓸 수 없음(스펙 불일치, 아래 참조).

## 2. TourAPI (한국관광공사, data.go.kr, 키 정상 동작)

- **서비스**: `https://apis.data.go.kr/B551011/{KorService2|EngService2|JpnService2}/...` 3개 모두 같은 키로 호출 성공. 공통 파라미터 `_type=json&MobileOS=ETC&MobileApp=HotelResearch&serviceKey=<URL인코딩>`.
- **숙박 목록**: `searchStay2` (숙박 전용, contentTypeId 지정 불필요). 대안 `areaBasedList2?contentTypeId=80`(Jpn/Eng) / `32`(Kor)도 동작. 필터는 `lDongRegnCd`, `lDongSignguCd`(권장) 또는 `areaCode`, `sigunguCode`(구형).
- **contentTypeId**: Kor 숙박 `32`, Jpn/Eng 숙박 `80`.
- **전국 숙박 건수**: Kor 2,956 / Jpn 274 / Eng 225. 일문·영문은 수가 매우 적음(서울 38, 제주 19 in Jpn). 호텔 후보 폭 확보에는 **KorService2가 사실상 필요**.
- **응답 경로** `response.body.items.item[]` (결과 없으면 `items`가 빈 문자열일 수 있음), 총수 `body.totalCount`:
  - 이름 `title`, 주소 `addr1`/`addr2`, 우편번호 `zipcode`, 좌표 `mapx`(경도)/`mapy`(위도) WGS84 문자열, 사진 `firstimage`/`firstimage2`(없으면 빈 문자열), 전화 `tel`(대부분 빈 값), id `contentid`, 분류 `lclsSystm1~3`(관측: AC010100, AC020100, AC030200, AC030400, AC040100, AC060100/200), 지역 `lDongRegnCd`/`lDongSignguCd`(+구형 `areacode`/`sigungucode`), 수정일 `modifiedtime`.
  - **홈페이지는 목록에 없음.** `detailCommon2?contentId=` 의 `homepage` 필드(**형식이 일정하지 않음**: 평문 URL `http://www.gnstayhill.com/`(fixture `tourapi_detail_homepage.json`)일 수도 있고, 실측 중 서울 한 곳에서는 HTML 앵커 `<a href="…" target="_blank" title="…">표시텍스트</a>`도 확인됨(앵커는 fixture 미보존). 빈 문자열도 흔함(JW 메리어트 제주). → 파서는 `href="…"` 우선 추출, 없으면 평문 URL, 둘 다 없으면 미등록 처리). 전화는 `detailIntro2` 의 `infocenterlodging`가 더 잘 채워짐. → 홈페이지 확보에 호텔당 추가 1회 호출 필요.
  - 등급(성급) 필드는 없음.
- **지역 코드**: `ldongCode2`(시도 16개, `lDongRegnCd=<시도>`로 시군구 조회), 구형 `areaCode2`(17개). 제주 하위: `110` 제주시, `130` 서귀포시.
- **일 호출 한도**: 응답 헤더 `x-ratelimit-limit: 1000` (일 1,000건, `x-ratelimit-remaining` 로 잔량 확인; 서비스별로 카운터가 따로 보임).

## 3. 한국 공식 4성 호텔

- **실측(2026-11-01)**: data.go.kr 15118900 CSV(`문화체육관광부_전국호텔현황_20260602.(최종)수정.csv`, 최종 수정 2026-09-21)를 내려받아 센 결과 전체 863곳 = 1성 96 / 2성 348 / 3성 226 / **4성 125 / 5성 68**. (이전 [미검증] 수치 4성 128 / 5성 73과, 스펙의 5성 89곳은 이 파일과 다름.) 홈페이지 칸이 "없음"인 곳은 4·5성 중 6곳.
- 참고(미검증): 호텔업등급관리국 https://www.hotelrating.or.kr/hotel 는 JS 렌더링 페이지라 직접 확인하지 못함.
- **파일 제공: 있음.** 공공데이터포털 "문화체육관광부_전국호텔현황" https://www.data.go.kr/data/15118900/fileData.do — CSV, 무료·이용허락 제한 없음, 최종 수정 2026-09-21, 등급 인정처=한국관광협회중앙회. 컬럼: 연번, 등급 인정처, 호텔업 구분, 결정 등급, 등급 결정일, 지역, 호텔명, 객실수, 주소, 전화번호, **홈페이지**. (호텔 성급 + 홈페이지를 한 번에 얻을 수 있어 KR 쪽 핵심 소스 후보.)
- 분기별 결과 공개(xlsx): 문체부 예 https://www.mcst.go.kr/site/s_policy/dept/deptView.jsp?pSeq=2113&pDataCD=0417000000&pType=05
- 다운로드 방법: 상세 페이지 JSON(`/tcs/dss/selectFileDataDownload.do?...publicDataPk=15118900...`)에서 `atchFileId`(FILE_000000003655134)를 얻고 `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=...&fileDetailSn=1&insertDataPrcus=N` 로 내려받음. 인코딩 EUC-KR(CP949). 캡차 없이 일반 요청으로 받았음.

## 4. Wikidata (SPARQL, P856 홈페이지)

- 표본 20곳(미쉐린 3키 일본 7 + 한·일 고급 13). 엔드포인트 `https://query.wikidata.org/sparql`, 설명적 User-Agent 필요.
- **라벨로 Wikidata 항목을 찾은 곳: 15/20. 그중 P856 있는 곳: 9곳 → 20곳 기준 45%(찾은 곳 기준 60%).**
  - 있음: Palace Hotel Tokyo, Amanemu, Hotel The Mitsui Kyoto, Aman Tokyo, The Peninsula Tokyo, Park Hyatt Tokyo, The Ritz-Carlton Kyoto, Park Hyatt Busan, Grand Hyatt Seoul.
  - 항목은 있으나 P856 없음: Asaba, Signiel Seoul, The Shilla Seoul, Four Seasons Seoul, Lotte Hotel Jeju, Andaz Seoul Gangnam.
  - 항목 못 찾음: Bulgari Hotel Tokyo, Four Seasons Hotel Tokyo at Otemachi, Gora Kadan, Hoshinoya Kyoto, Josun Palace.
- 한국 호텔은 항목이 있어도 P856 없는 비율이 높음 → Wikidata는 보조 소스. 라벨 매칭은 동명이인이 많아(예 "Asaba"는 나이지리아·키르기스스탄 항목도 있음) 국가 필터가 필수.
- 샘플: `tests/fixtures/wikidata_asaba.json`(Asaba Q4803192 전체 속성).

## 스펙과 다른 점 (Spec discrepancies)

1. **한국 지역 코드**: `kr:<areaCode>[:<sigunguCode>]` 불가 → `kr:<lDongRegnCd>[:<lDongSignguCd>]` (구형 areaCode는 신규 숙소에서 비어 있음).
2. **일본 지역 코드**: `jp:<middle>[:<small>]` 에서 small이 사실상 필수, 도쿄23구는 detail까지 필수.
3. **라쿠텐에 공식 홈페이지 필드 없음** → "홈페이지 미등록" 비율이 높아지는 정도가 아니라 일본 전 호텔이 라쿠텐만으로는 홈페이지 없음. 홈페이지는 Wikidata P856 또는 별도 소스 필요.
4. **라쿠텐 `Origin` 헤더 필수**(Referer만으론 403). 좌표는 `datumType=1` 필요.
5. **라쿠텐 HotelRanking genre=premium 데이터가 2014년에서 정지** → 고급 호텔 후보 소스로 불가.
6. **TourAPI 홈페이지는 목록에 없고 detailCommon2(호텔당 1회)에서만, 평문 URL 또는 HTML 앵커 문자열(형식 불일정).** 일문·영문 숙박은 274/225건뿐이라 한국 후보 폭은 KorService2(2,956건)에 의존해야 함.
7. **TourAPI 일 한도 1,000건**(서비스별 카운터로 보임) → 전국 홈페이지 수집은 며칠에 나눠야 함.
8. **새 소스 발견**: 공공데이터 `전국호텔현황` CSV(성급·홈페이지·전화 포함) — 한국 4·5성 판정에 TourAPI보다 유리.

## 추가 실측 (Task 4 수정 라운드)

- **라쿠텐 SimpleHotelSearch `sort=-roomCharge`**: 허용됨(200). 하코네 1페이지(30건) 실측 `hotelMinCharge`: 92125, 80781, 66000 … 55000, 54500, 53800, **49110, 51460**, 50750, 49000 … 38000. 대체로 내림차순이지만 `roomCharge` 기준 정렬이라 `hotelMinCharge`와는 엄밀히 일치하지 않음(역전 관측). fetch-region은 "한 페이지에 후보(≥기준)가 하나도 없으면 중단"으로 처리하고 10페이지 상한은 백스톱(잘리면 `console.warn`).
