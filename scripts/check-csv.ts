// data/*.csv 검사: 헤더(스펙 4.1·4.1.1), 허용값·등급 범위·연도, homepage는 비어 있거나 유효 URL(OTA 제외).
const AWARDS_HEADER = "country,name_ja,name_en,name_ko,type,award,grade,year,homepage,address";
const MEDIA_HEADER = "country,name_en,name_ja,outlet,list_name,year";
const AWARDS = ["michelin", "forbes", "kr_official", "brand", "membership"];
const TYPES = ["hotel", "resort", "ryokan"];

function parse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f.replace(/\r$/, "")); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const errs: string[] = [];
function load(file: string, header: string) {
  const rows = parse(Deno.readTextFileSync(file));
  if (!rows.length || !rows[0].join("")) { errs.push(`${file}: 빈 파일`); return { head: [] as string[], body: [] as string[][] }; }
  if (rows[0].join(",") !== header) errs.push(`${file}: 헤더 불일치`);
  const n = rows[0].length;
  rows.slice(1).forEach((r, i) => { if (r.length !== n) errs.push(`${file}:${i + 2} 열 수 ${r.length} != ${n}`); });
  return { head: rows[0], body: rows.slice(1) };
}

const OTA = /(^|\.)(booking\.com|agoda\.[a-z.]+|trip\.com|jalan\.net|travel\.rakuten\.[a-z.]+|ikyu\.com|expedia\.[a-z.]+|hotels\.com)$/i;
const GRADE: Record<string, RegExp> = { michelin: /^[1-3]$/, forbes: /^[45]$/, kr_official: /^[45]$/ };

for (const f of ["data/awards_jp.csv", "data/awards_kr.csv"]) {
  const { head, body } = load(f, AWARDS_HEADER);
  if (!body.length) errs.push(`${f}: 데이터 행 없음`);
  const ix = (k: string) => head.indexOf(k);
  body.forEach((r, i) => {
    const at = `${f}:${i + 2}`;
    const v = (k: string) => (r[ix(k)] ?? "").trim();
    if (!["JP", "KR"].includes(v("country"))) errs.push(`${at} country 값 오류: ${v("country")}`);
    if (!AWARDS.includes(v("award"))) errs.push(`${at} award 값 오류: ${v("award")}`);
    if (!TYPES.includes(v("type"))) errs.push(`${at} type 값 오류: ${v("type")}`);
    if (!/^\d{4}$/.test(v("year"))) errs.push(`${at} year 형식 오류: ${v("year")}`);
    if (!v("grade")) errs.push(`${at} grade 없음`);
    else if (GRADE[v("award")] && !GRADE[v("award")].test(v("grade"))) errs.push(`${at} ${v("award")} grade 범위 오류: ${v("grade")}`);
    const hp = v("homepage"); // 비어 있어도 됨 (Wikidata·수동 입력으로 나중에 채움)
    if (hp) {
      let host = "";
      try { const u = new URL(hp); if (!/^https?:$/.test(u.protocol)) throw 0; host = u.hostname; } catch { errs.push(`${at} homepage 형식 오류: ${hp}`); }
      if (OTA.test(host)) errs.push(`${at} homepage가 OTA 도메인: ${host}`);
    }
    if (v("country") === "JP" && !v("name_en") && !v("name_ja")) errs.push(`${at} JP 행에 name_en/name_ja 없음`);
    if (v("country") === "KR" && !v("name_ko")) errs.push(`${at} KR 행에 name_ko 없음`);
  });
}
load("data/media_mentions.csv", MEDIA_HEADER);

if (errs.length) { console.error(errs.join("\n")); Deno.exit(1); }
console.log("CSV OK");
