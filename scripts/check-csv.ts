// data/*.csv 검사: 헤더(스펙 4.1·4.1.1), award·type 허용값, awards 행의 homepage 필수.
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
  if (rows[0].join(",") !== header) errs.push(`${file}: 헤더 불일치`);
  const n = rows[0].length;
  rows.slice(1).forEach((r, i) => { if (r.length !== n) errs.push(`${file}:${i + 2} 열 수 ${r.length} != ${n}`); });
  return { head: rows[0], body: rows.slice(1) };
}

for (const f of ["data/awards_jp.csv", "data/awards_kr.csv"]) {
  const { head, body } = load(f, AWARDS_HEADER);
  const ix = (k: string) => head.indexOf(k);
  body.forEach((r, i) => {
    const at = `${f}:${i + 2}`;
    if (!AWARDS.includes(r[ix("award")])) errs.push(`${at} award 값 오류: ${r[ix("award")]}`);
    if (!TYPES.includes(r[ix("type")])) errs.push(`${at} type 값 오류: ${r[ix("type")]}`);
    if (!/^https?:\/\/\S+$/.test(r[ix("homepage")] ?? "")) errs.push(`${at} homepage 없음/형식 오류`);
    if (!r[ix("name_en")] && !r[ix("name_ko")] && !r[ix("name_ja")]) errs.push(`${at} 이름 없음`);
    if (!r[ix("grade")]) errs.push(`${at} grade 없음`);
  });
}
load("data/media_mentions.csv", MEDIA_HEADER);

if (errs.length) { console.error(errs.join("\n")); Deno.exit(1); }
console.log("CSV OK");
