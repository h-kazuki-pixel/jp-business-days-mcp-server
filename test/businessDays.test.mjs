import test from "node:test";
import assert from "node:assert/strict";
import { isBusinessDay, addBusinessDays, businessDaysBetween } from "../dist/businessDays.js";

test("土日は営業日でない", () => {
  assert.equal(isBusinessDay("2026-08-08").isBusinessDay, false); // 土
  assert.equal(isBusinessDay("2026-08-09").isBusinessDay, false); // 日
  assert.equal(isBusinessDay("2026-08-07").isBusinessDay, true); // 金
});

test("祝日は営業日でなく、理由に祝日名を返す", () => {
  const r = isBusinessDay("2026-01-01");
  assert.equal(r.isBusinessDay, false);
  assert.equal(r.reason, "元日");
});

test("振替休日も営業日でない", () => {
  // 2026-05-03(日)憲法記念日の振替は5/6
  assert.equal(isBusinessDay("2026-05-06").isBusinessDay, false);
});

test("国民の休日も営業日でない", () => {
  // 2026-09-22(火)敬老の日と秋分の日に挟まれた平日
  assert.equal(isBusinessDay("2026-09-22").isBusinessDay, false);
});

test("年をまたぐ加算が正しく計算される", () => {
  // 2026-12-30(水)起点。12/31(木)=1、1/1(金)は元日、1/2-1/3は土日、1/4(月)=2、1/5(火)=3
  assert.equal(addBusinessDays("2026-12-30", 3), "2027-01-05");
  assert.equal(addBusinessDays("2026-12-31", 1), "2027-01-04");
});

test("年末年始の休業は営業日として扱う(会社休業日は対象外)", () => {
  // 12/29〜1/3 は法律上の祝日ではないため、平日なら営業日
  assert.equal(isBusinessDay("2026-12-31").isBusinessDay, true); // 木
  assert.equal(isBusinessDay("2027-01-04").isBusinessDay, true); // 月
});

test("負の数を渡すと過去方向へ計算する", () => {
  assert.equal(addBusinessDays("2027-01-05", -3), "2026-12-30");
});

test("加算と減算が往復で一致する", () => {
  for (const [date, n] of [
    ["2026-07-17", 10],
    ["2026-04-28", 5],
    ["2026-12-25", 7],
  ]) {
    assert.equal(addBusinessDays(addBusinessDays(date, n), -n), date);
  }
});

test("営業日数のカウントは両端を含む", () => {
  // 2026-07-17(金)・7/18(土)・7/19(日)・7/20(海の日)・7/21(火)
  assert.equal(businessDaysBetween("2026-07-17", "2026-07-21"), 2);
  assert.equal(businessDaysBetween("2026-07-21", "2026-07-21"), 1);
  assert.equal(businessDaysBetween("2026-07-20", "2026-07-20"), 0);
});

test("対応範囲の外へ出る計算はエラーを返す(誤った値を返さない)", () => {
  assert.throws(() => addBusinessDays("2099-12-30", 3), /対応範囲外/);
  assert.throws(() => addBusinessDays("2020-01-01", -3), /対応範囲外/);
  assert.throws(() => isBusinessDay("2019-12-31"), /対応範囲外/);
});
