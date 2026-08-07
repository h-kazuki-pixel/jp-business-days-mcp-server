import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getHolidays, holidayName } from "../dist/holidays.js";

/**
 * 照合元: 内閣府「国民の祝日について」の公表CSV
 *   https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv
 * test/fixtures/syukujitsu.csv として同梱(文字コードのみ Shift_JIS → UTF-8 に変換。内容は無改変)
 *
 * CSVは 1955年〜翌年分を収録。本サーバーの対応範囲は 2020〜2099年のため、
 * 両者が重なる 2020年〜CSV最終年 を全件突き合わせる。
 */

const CSV_PATH = fileURLToPath(new URL("./fixtures/syukujitsu.csv", import.meta.url));

/** CSVを読み、年ごとの [日付, 名称] 配列にまとめる */
function loadCabinetOfficeCsv() {
  const text = readFileSync(CSV_PATH, "utf8");
  const byYear = new Map();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "").trim();
    if (!line) continue;
    const [dateField, name] = line.split(",");
    const m = dateField.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!m) continue; // ヘッダー行
    const [, y, mo, d] = m;
    const year = Number(y);
    const date = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push([date, name]);
  }
  return byYear;
}

/**
 * 本サーバーの名称をCSVの表記に合わせる。
 * CSVは振替休日・国民の休日をどちらも「休日」と記載するため、その1点だけを吸収する。
 * 16の祝日そのものの名称は変換せず、そのまま突き合わせる。
 */
function toCsvName(name) {
  if (name.startsWith("振替休日")) return "休日";
  if (name === "国民の休日") return "休日";
  return name;
}

const csv = loadCabinetOfficeCsv();
const SUPPORTED_FROM = 2020;
const csvLastYear = Math.max(...csv.keys());
const targetYears = [];
for (let y = SUPPORTED_FROM; y <= csvLastYear; y++) targetYears.push(y);

test("フィクスチャが照合に足る内容であること(取り違え・破損の検出)", () => {
  assert.ok(csv.has(1955), "CSVの開始年 1955 が含まれていない");
  assert.ok(csvLastYear >= 2027, `CSVの最終年が古い: ${csvLastYear}`);
  assert.ok(targetYears.length >= 8, `突き合わせ対象の年が少なすぎる: ${targetYears.length}年`);
  // 1955年以降の総件数。CSVが途中で切れていれば落ちる
  const total = [...csv.values()].reduce((n, rows) => n + rows.length, 0);
  assert.ok(total > 1000, `CSVの行数が少なすぎる: ${total}`);
});

for (const year of targetYears) {
  test(`${year}年: 内閣府CSVと日付・名称が完全一致する`, () => {
    const expected = csv
      .get(year)
      .map(([date, name]) => `${date} ${name}`)
      .sort();
    const actual = getHolidays(year)
      .map((h) => `${h.date} ${toCsvName(h.name)}`)
      .sort();
    assert.deepEqual(actual, expected);
  });
}

test("対応範囲外の年はエラーを返す", () => {
  assert.throws(() => getHolidays(2019), /対応範囲外/);
  assert.throws(() => getHolidays(2100), /対応範囲外/);
  assert.doesNotThrow(() => getHolidays(2020));
  assert.doesNotThrow(() => getHolidays(2099));
});

test("五輪特例: 2020年の海の日・スポーツの日・山の日が移動している", () => {
  const h = getHolidays(2020);
  assert.equal(h.find((x) => x.name === "海の日").date, "2020-07-23");
  assert.equal(h.find((x) => x.name === "スポーツの日").date, "2020-07-24");
  assert.equal(h.find((x) => x.name === "山の日").date, "2020-08-10");
});

test("五輪特例: 2021年の海の日・スポーツの日・山の日が移動している", () => {
  const h = getHolidays(2021);
  assert.equal(h.find((x) => x.name === "海の日").date, "2021-07-22");
  assert.equal(h.find((x) => x.name === "スポーツの日").date, "2021-07-23");
  assert.equal(h.find((x) => x.name === "山の日").date, "2021-08-08");
});

test("五輪特例は2022年以降には適用されない(通常の第3月曜・8月11日に戻る)", () => {
  const h = getHolidays(2022);
  assert.equal(h.find((x) => x.name === "海の日").date, "2022-07-18");
  assert.equal(h.find((x) => x.name === "スポーツの日").date, "2022-10-10");
  assert.equal(h.find((x) => x.name === "山の日").date, "2022-08-11");
});

test("振替休日: 日曜の祝日の翌日が休日になる", () => {
  // 2020-02-23(日)天皇誕生日 → 2020-02-24(月)
  assert.equal(holidayName("2020-02-24"), "振替休日(天皇誕生日)");
  // 2021-08-08(日)山の日 → 2021-08-09(月)
  assert.equal(holidayName("2021-08-09"), "振替休日(山の日)");
});

test("振替休日: 翌日も祝日の場合はさらに次の平日へずれる", () => {
  // 2026-05-03(日)憲法記念日。5/4・5/5も祝日のため振替は5/6
  assert.equal(holidayName("2026-05-06"), "振替休日(憲法記念日)");
  assert.equal(holidayName("2026-05-04"), "みどりの日");
  assert.equal(holidayName("2026-05-05"), "こどもの日");
});

test("国民の休日: 敬老の日と秋分の日に挟まれた平日が休日になる", () => {
  // 2026-09-21 敬老の日 / 2026-09-23 秋分の日 → 9/22 が国民の休日
  assert.equal(holidayName("2026-09-22"), "国民の休日");
});

test("国民の休日: 挟まれていない年には発生しない", () => {
  // 2025年は敬老の日 9/15・秋分の日 9/23 で離れている
  assert.equal(getHolidays(2025).filter((h) => h.name === "国民の休日").length, 0);
});

test("春分の日・秋分の日が年によって変動する", () => {
  assert.equal(getHolidays(2020).find((h) => h.name === "春分の日").date, "2020-03-20");
  assert.equal(getHolidays(2021).find((h) => h.name === "春分の日").date, "2021-03-20");
  assert.equal(getHolidays(2022).find((h) => h.name === "春分の日").date, "2022-03-21");
  assert.equal(getHolidays(2020).find((h) => h.name === "秋分の日").date, "2020-09-22");
  assert.equal(getHolidays(2021).find((h) => h.name === "秋分の日").date, "2021-09-23");
});

test("holidayName: 祝日でない日には null を返す", () => {
  assert.equal(holidayName("2026-08-07"), null);
  assert.equal(holidayName("2026-01-05"), null);
});

test("祝日一覧は日付の昇順で返る", () => {
  for (const year of [2020, 2024, 2026, 2050]) {
    const dates = getHolidays(year).map((h) => h.date);
    assert.deepEqual(dates, [...dates].sort(), `${year}年の並び順が昇順でない`);
  }
});

test("対応範囲の全80年で、祝日が重複した日付を持たない", () => {
  for (let year = 2020; year <= 2099; year++) {
    const dates = getHolidays(year).map((h) => h.date);
    assert.equal(new Set(dates).size, dates.length, `${year}年に重複した日付がある`);
  }
});
