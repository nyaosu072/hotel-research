# data/ 출처와 범위

확인일: 2026-11-01. 모든 CSV는 UTF-8, 공개 정보만 (연락처 없음). 이 파일은 사람이 매년 갱신하는 수작업 명단이다.
`deno run -A scripts/check-csv.ts` 로 헤더·허용값·homepage 필수를 검사한다.

## 규칙
- 한 호텔이 여러 명단에 있으면 award마다 한 행 (이름·homepage 동일).
- `homepage`는 공식 사이트만. 공식 사이트를 확인하지 못한 곳은 CSV에서 뺐고 아래 "homepage 미확인"에 적었다.
- 일본 homepage는 요청 시 응답 확인(HTTP 200/403/503 = 호스트 존재, 404·DNS 실패·무관한 사이트는 제외). 403/503은 봇 차단일 수 있어 내용 확인은 못 했다. Marriott·Hyatt·Hilton·Four Seasons 등 대형 체인은 대부분 403.
- 일본 `address`는 시·구 단위(도도부현+시군구). 한국 `address`는 공공데이터 원문(Art Paradiso·JW Jeju·유원재는 직접 기입, 유원재는 시·면 단위).
- `name_en`은 공식 영문명을 확신하는 경우만 채웠다. 한국 공식 4·5성 중 영문명 불확실한 곳은 비워 뒀다 (번역 추측 금지). `name_ja`는 일본 호텔만, `name_ko`는 한국 호텔만.
- `year`는 판 연도 (미쉐린 2026, 포브스 2026, 한국 공식 = 데이터 기준 2026-06, 브랜드·회원 = 확인 연도 2026).

## 한국 공식 4·5성 (`award=kr_official`, awards_kr.csv)
- 소스: 공공데이터포털 "문화체육관광부_전국호텔현황" https://www.data.go.kr/data/15118900/fileData.do (CSV, 이용허락범위 제한 없음, 파일명 `..._20260602.(최종)수정.csv`, 최종 수정 2026-09-21, 등급 인정처 한국관광협회중앙회, 등급 결정일 2026-06 전후).
- 전체 863곳: 1성 96 / 2성 348 / 3성 226 / **4성 125 / 5성 68**. (원본 CSV는 EUC-KR, 전화번호·사업자 정보 포함이라 저장소에 넣지 않았다.)
- CSV 반영: 4성 120 + 5성 67 = 187행. 제외 6곳은 파일의 홈페이지 칸이 "없음".
- 호텔명은 법인 접두어((주) 등)를 지워 `name_ko`로 썼다. 데이터 오류 가능성: "웨스틴 서울 파르나스"(홈페이지가 InterContinental COEX), "하얏트리젠시인천파라다이스시티"(홈페이지가 Grand Hyatt Incheon)는 원문 그대로. 일부 홈페이지(힐튼가든인 강남 등)는 접속 불가라 원문 그대로 둠.
- 보정한 홈페이지: 이메일 형태 2건(Grand Hyatt Incheon, 호텔리베라서울), www 누락 → https:// 추가, 쿼리 `?` 누락 복구, 신라스테이 삼성(공통 URL 패턴), 아난티 앳 부산 빌라쥬(ananti.kr).
- 참고: 스펙 4.1의 "5성 89곳" 표기는 이 파일과 맞지 않는다 (이 파일 5성 68, 4성 125).

## 미쉐린 키 2026 (`award=michelin`)
- 한국 9곳 (2키 3: Four Seasons Seoul, Signiel Seoul, Signiel Busan / 1키 6): https://guide.michelin.com/sg/en/article/travel/all-the-michelin-key-hotels-in-south-korea (2026-09-18 선정 기준). 9곳 모두 반영.
- 일본 145곳 (3키 7 / 2키 23 / 1키 115): https://guide.michelin.com/us/en/article/travel/all-the-key-hotels-japan-michelin-guide. CSV 반영은 homepage를 확인한 91곳 (3키 7, 2키 16, 1키 68). 나머지 54곳은 아래 미확인.
- Michelin 사이트는 봇 차단(202)이라 호텔별 페이지에서 홈페이지를 읽지 못했다.

## 포브스 트래블 가이드 2026 (`award=forbes`)
- 한국: https://www.forbestravelguide.com/destinations/seoul-south-korea (5성 2: Four Seasons Seoul, Shilla Seoul / 4성: Conrad Seoul, Josun Palace Gangnam, Park Hyatt Seoul, Signiel Seoul, Art Paradiso). 부산은 Park Hyatt Busan이 "Curated"만 있어 제외. "Paradise Hotel & Resort"(4성)는 대상 호텔을 특정하지 못해 제외.
- 일본: 포브스 공식 목록 직접 조회는 불완전했고, 2026판 일본 5성 16·4성 25를 정리한 제3자 글 https://note.com/sun012726/n/n5d23b70b3024 과 포브스 검색 결과로 대조했다. 공식 페이지로 호텔별 재확인 필요. CSV 반영: 5성 14, 4성 24 (Takanawa Hanakohro는 homepage 미확인으로 제외).

## 럭셔리 브랜드 (`award=brand`)
- 일본: 스펙 4.1의 브랜드 중 미쉐린/포브스 목록과 호텔 지식으로 확인되는 지점 + 星のや 6, 界 10. 아래는 **미수록**: Ritz-Carlton 외 지점 일부, Regent, Waldorf Astoria 외 신규 개업 지점 등 (브랜드 공식 사이트에서 전수 조사하지 못함).
- 한국: 공식 4·5성 목록과 겹치는 Park Hyatt Seoul/Busan, Andaz Seoul Gangnam, Conrad Seoul, Four Seasons Seoul, Grand InterContinental Seoul Parnas, InterContinental Alpensia Pyeongchang 7행만. 한국의 St. Regis·Ritz-Carlton·Regent·Six Senses·Aman 등은 확인하지 못해 비워 둠.
- 브랜드 전수 조사는 미완. 다음 갱신 때 각 브랜드 공식 호텔 목록으로 보완할 것.

## 회원 단체 (`award=membership`, 일본만)
- Relais & Châteaux: https://www.relaischateaux.com/us/destinations/asia/japan (31건 중 확인한 호텔; 레스토랑 제외). 한국 없음.
- The Leading Hotels of the World: lhw.com이 403이라 검색 결과와 보도자료(https://www.hospitalitynet.org/news/4126586.html 등)로 정리한 부분 목록. 한국 지점은 확인 못 함.
- Small Luxury Hotels of the World: https://www.slh.com/destinations/asia/japan/ (일부만 표시됨) + Sowaka 검색 결과. 한국 없음.
- 세 단체 모두 **전수 조사 아님**.

## 매체 명단 (media_mentions.csv)
- Condé Nast Traveler Readers' Choice 2025 (미국판·영국판 구분 표기): Four Seasons Tokyo Otemachi, ROKU KYOTO, Four Seasons Kyoto, Park Hyatt Kyoto — https://www.enprimeurclub.com/lists/2025-conde-nast-best-hotels, https://press.fourseasons.com/kyoto/hotel-news/2025/best-hotels-in-japan, https://www.timeout.com/asia/news/these-are-the-best-hotels-in-asia-in-2025-according-to-conde-nast-traveller-101325
- Travel + Leisure World's Best 2026: Patina Osaka (세계 1위) — https://www.hotel-online.com/news/travel-leisure-announces-2026-worlds-best-awards-showcasing-the-top-travel-destinations-hotels-airlines-and-more
- 한국: Park Hyatt Seoul (T+L Luxury Awards Asia Pacific 2026), Four Seasons Seoul (T+L 500 2025) — World's Best 한국 호텔 순위는 찾지 못해 인접 T+L 명단으로 대체.
- 일본·한국 전체 순위표는 CNT/T+L 사이트가 접근 제한이라 확보하지 못했다. **매우 부분적**.

## homepage 미확인 (CSV에서 제외)

### 일본 (호텔명, 해당 명단 태그: M3/M2/M1 = 미쉐린 키, F5/F4 = 포브스, B = 브랜드, S = 회원 단체)
- Sekitei (M2)
- Kanamean Nishitomiya (M2,S:Relais & Châteaux)
- The Shinmonzen (M2)
- The Hiramatsu Karuizawa Miyota (M2)
- ENOWA Yufu (M2,S:Relais & Châteaux)
- Kamenoi Besso (M2)
- Jusandi (M2)
- SETOUCHI RETREAT by Onko Chishin (M1)
- Beniya Kofuyuden (M1)
- Bettei Senjuan (M1,S:Relais & Châteaux)
- Ryokan Onomichi Nishiyama (M1)
- Azumi Setoda (M1)
- Simose Art Garden Villa (M1)
- SHIGUCHI (M1)
- Araya Totoan (M1)
- Tsuruko (M1)
- Hitotsu Notojima (M1)
- ANA InterContinental Appi Kogen Resort (M1,B:InterContinental)
- AZUMA FARM Koiwai (M1)
- Naoshima Ryokan Roka (M1)
- Myoken Ishiharaso (M1)
- Sankara Hotel & Spa Yakushima (M1)
- ESPACIO The Hakone Geihinkan Rin-Poh-Ki-Ryu (M1,S:The Leading Hotels of the World)
- Hakone Gora Karaku (M1)
- Casa CABaN HAYAMA (M1)
- InterContinental Yokohama Pier 8 (M1,B:InterContinental)
- TAYUTA amakusa (M1)
- Garrya Nijo Castle Kyoto (M1)
- Suiran, a Luxury Collection Hotel, Kyoto (M1,F4)
- Kifune Ugenta (M1)
- Oyado The Earth (M1)
- Hacienda Vision Hotel (M1)
- SHISHI-IWA-HOUSE Karuizawa (M1)
- Tobira Onsen Myojinkan (M1,S:Relais & Châteaux)
- BYAKU Narai (M1)
- GOTO RETREAT by Onko Chishin (M1)
- RYOTEI HANZUIRYO (M1)
- Jivana Miyakojima (M1)
- InterContinental Osaka (M1,B:InterContinental)
- Izumo Hotel The Cliff (M1)
- Atami Izusan Karaku (M1)
- Fugaku Gunjo (M1)
- Arcana Izu (M1)
- Fuji Speedway Hotel (M1)
- Numazu Club (M1)
- Kinugawa Keisui (M1)
- Auberge TOKITO (M1)
- Bellustar Tokyo, A Pan Pacific Hotel (M1)
- FUFU Tokyo Ginza (M1)
- Hotel New Otani Tokyo - Executive House ZEN (M1,F5)
- The Aoyama Grand Hotel (M1)
- Osteria Sincerita (M1)
- Yamagata The Takinami (M1)
- Bettei Otozure (M1)
- Takanawa Hanakohro (F5)
- Kawana Hotel Golf Course (S:Small Luxury Hotels of the World)
- CUVEE J2 Hotel Osaka by Onko Chishin (S:Small Luxury Hotels of the World)
- FAUCHON L'Hotel Kyoto (S:Small Luxury Hotels of the World)
- Five Spring Resort, The Shirahama (S:Small Luxury Hotels of the World)
- Hotel GrandBach Atami Crescendo (S:Small Luxury Hotels of the World)
- Hotel La Suite Kobe Harborland (S:Small Luxury Hotels of the World)
- Noborioji Hotel Nara (S:Relais & Châteaux)
- The Kitano Hotel Tokyo (S:Relais & Châteaux)
- The Uza Terrace Beach Club Villas (S:Relais & Châteaux)
- InterContinental Tokyo Bay (B:InterContinental)
- Yokohama Grand InterContinental Hotel (B:InterContinental)
### 한국 (공공데이터 홈페이지 칸이 "없음")
- 대구 메리어트 호텔 (5성, 대구)
- 더케이호텔경주 (4성, 경북)
- 호텔티롤 (4성, 전북)
- 스위트호텔남원 (4성, 전북)
- 쏠비치 호텔 진도 (4성, 전남)
- 라마다군산호텔 (4성, 전북)