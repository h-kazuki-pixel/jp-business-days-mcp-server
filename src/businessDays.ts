/**
 * 日本の営業日(平日かつ祝日でない日)を計算するモジュール
 * ネットワーク不要・完全オフライン動作。対応範囲: 2020〜2099年
 */
import { addDays, dayOfWeek, holidayName } from "./holidays.js";

export interface BusinessDayCheck {
  isBusinessDay: boolean;
  reason: string | null; // 非営業日の理由(土曜日/日曜日/祝日名)。営業日ならnull
}

const MIN_YEAR = 2020;
const MAX_YEAR = 2099;

function assertInRange(dateStr: string): void {
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new Error(
      `対応範囲外の日付です: ${dateStr}(このサーバーは${MIN_YEAR}〜${MAX_YEAR}年に対応しています)`
    );
  }
}

/** 指定日が営業日かどうかを判定する */
export function isBusinessDay(dateStr: string): BusinessDayCheck {
  assertInRange(dateStr);
  const dow = dayOfWeek(dateStr);
  if (dow === 0) return { isBusinessDay: false, reason: "日曜日" };
  if (dow === 6) return { isBusinessDay: false, reason: "土曜日" };
  const h = holidayName(dateStr);
  if (h) return { isBusinessDay: false, reason: h };
  return { isBusinessDay: true, reason: null };
}

/**
 * 指定日からn営業日後(nが正)、またはn営業日前(nが負)の日付を返す。
 * 起点日自体はカウントしない。n=0は不可。
 */
export function addBusinessDays(dateStr: string, n: number): string {
  if (n === 0) {
    throw new Error("daysに0は指定できません(1以上、または-1以下を指定してください)");
  }
  assertInRange(dateStr);
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let current = dateStr;
  while (remaining > 0) {
    current = addDays(current, step);
    assertInRange(current);
    if (isBusinessDay(current).isBusinessDay) {
      remaining--;
    }
  }
  return current;
}

/** start〜end(両端含む)の間の営業日数をカウントする。start <= end が必要 */
export function businessDaysBetween(start: string, end: string): number {
  assertInRange(start);
  assertInRange(end);
  if (start > end) {
    throw new Error("startはend以前の日付を指定してください");
  }
  let count = 0;
  let current = start;
  while (current <= end) {
    if (isBusinessDay(current).isBusinessDay) count++;
    current = addDays(current, 1);
  }
  return count;
}
