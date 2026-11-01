import { assert, assertEquals } from "@std/assert";
import { toCsv } from "../js/csv.js";

Deno.test("toCsv: BOM, CRLF, RFC 4180 quoting", () => {
  const csv = toCsv([{ name: '箱根 "強羅" 花壇', email: "a@b.jp" }], ["name", "email"]);
  assert(csv.startsWith("﻿"));
  assertEquals(csv.slice(1).split("\r\n")[0], "name,email");
  assertEquals(csv.slice(1).split("\r\n")[1], '"箱根 ""強羅"" 花壇",a@b.jp');
});

Deno.test("toCsv: commas, newlines, nulls, formula guard", () => {
  const csv = toCsv([{ a: "x,y", b: "l1\nl2", c: null, d: "=SUM(A1)", e: "+81 3-1234-5678" }], ["a", "b", "c", "d", "e"]);
  assertEquals(csv.slice(1).split("\r\n")[1], `"x,y","l1\nl2",,'=SUM(A1),+81 3-1234-5678`);
});
