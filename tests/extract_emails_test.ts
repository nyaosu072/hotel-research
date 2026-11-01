import { assertEquals } from "@std/assert";
import { extractEmails, isSafeUrl } from "../supabase/functions/_shared/extract-emails.ts";

Deno.test("extractEmails", () => {
  assertEquals(extractEmails('<a href="mailto:PR@Hotel.jp?subject=Hi">x</a>'), ["pr@hotel.jp"]);
  assertEquals(extractEmails("info&#64;ryokan.jp"), ["info@ryokan.jp"]);
  assertEquals(extractEmails('<img src="logo@2x.png"> sales@hotel.co.jp'), ["sales@hotel.co.jp"]);
  assertEquals(extractEmails("a@b.jp a@b.jp"), ["a@b.jp"]);
  assertEquals(extractEmails("no email here"), []);
  assertEquals(extractEmails("info&#x40;stay.kr / Reserve@Stay.kr"), ["info@stay.kr", "reserve@stay.kr"]);
});

Deno.test("isSafeUrl", () => {
  assertEquals(isSafeUrl("https://www.asaba-ryokan.com/"), true);
  assertEquals(isSafeUrl("ftp://a.jp"), false);
  assertEquals(isSafeUrl("http://localhost/x"), false);
  assertEquals(isSafeUrl("http://127.0.0.1/"), false);
  assertEquals(isSafeUrl("http://10.0.0.5/"), false);
  assertEquals(isSafeUrl("http://192.168.1.1/"), false);
  assertEquals(isSafeUrl("http://169.254.169.254/latest"), false);
  assertEquals(isSafeUrl("http://[::1]/"), false);
  assertEquals(isSafeUrl("not a url"), false);
});
