/**
 * 日本の祝日を計算で算出するモジュール(2020年以降の法制度に基づく)
 * ネットワーク不要・完全オフライン動作
 *
 * jp-dates-mcp-server の祝日ロジックを移植したものです。
 */

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

/** n回目の月曜日の日付を返す */
function nthMonday(year: number, month: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  // 月曜=1
  const offset = (8 - first) % 7; // 最初の月曜までの日数
  return 1 + offset + (n - 1) * 7;
}

/** 春分の日(簡易計算式、1980-2099年で有効) */
function vernalEquinox(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** 秋分の日(簡易計算式、1980-2099年で有効) */
function autumnalEquinox(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 日付に日数を加算(負の数で減算)。YYYY-MM-DD形式の文字列を返す */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 曜日を返す(0=日曜〜6=土曜) */
export function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay();
}

/** 指定年の祝日一覧(振替休日・国民の休日を含む) */
export function getHolidays(year: number): Holiday[] {
  if (year < 2020 || year > 2099) {
    throw new Error(
      `対応範囲外の年です: ${year}(このサーバーは2020〜2099年に対応しています)`
    );
  }

  const base: Holiday[] = [
    { date: ymd(year, 1, 1), name: "元日" },
    { date: ymd(year, 1, nthMonday(year, 1, 2)), name: "成人の日" },
    { date: ymd(year, 2, 11), name: "建国記念の日" },
    { date: ymd(year, 2, 23), name: "天皇誕生日" },
    { date: ymd(year, 3, vernalEquinox(year)), name: "春分の日" },
    { date: ymd(year, 4, 29), name: "昭和の日" },
    { date: ymd(year, 5, 3), name: "憲法記念日" },
    { date: ymd(year, 5, 4), name: "みどりの日" },
    { date: ymd(year, 5, 5), name: "こどもの日" },
    { date: ymd(year, 7, nthMonday(year, 7, 3)), name: "海の日" },
    { date: ymd(year, 8, 11), name: "山の日" },
    { date: ymd(year, 9, nthMonday(year, 9, 3)), name: "敬老の日" },
    { date: ymd(year, 9, autumnalEquinox(year)), name: "秋分の日" },
    { date: ymd(year, 10, nthMonday(year, 10, 2)), name: "スポーツの日" },
    { date: ymd(year, 11, 3), name: "文化の日" },
    { date: ymd(year, 11, 23), name: "勤労感謝の日" },
  ];

  // 2020年・2021年の五輪特例(海の日・スポーツの日・山の日の移動)
  if (year === 2020) {
    replace(base, "海の日", "2020-07-23");
    replace(base, "スポーツの日", "2020-07-24");
    replace(base, "山の日", "2020-08-10");
  } else if (year === 2021) {
    replace(base, "海の日", "2021-07-22");
    replace(base, "スポーツの日", "2021-07-23");
    replace(base, "山の日", "2021-08-08");
  }

  base.sort((a, b) => a.date.localeCompare(b.date));
  const dates = new Set(base.map((h) => h.date));
  const result: Holiday[] = [...base];

  // 振替休日: 祝日が日曜の場合、その後の最初の平日(祝日でない日)
  for (const h of base) {
    if (dayOfWeek(h.date) === 0) {
      let d = addDays(h.date, 1);
      while (dates.has(d)) d = addDays(d, 1);
      result.push({ date: d, name: `振替休日(${h.name})` });
      dates.add(d);
    }
  }

  // 国民の休日: 前後を祝日に挟まれた平日(例: シルバーウィーク)
  for (const h of base) {
    const between = addDays(h.date, 1);
    const after = addDays(h.date, 2);
    if (
      base.some((x) => x.date === after) &&
      !dates.has(between) &&
      dayOfWeek(between) !== 0
    ) {
      result.push({ date: between, name: "国民の休日" });
      dates.add(between);
    }
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

function replace(list: Holiday[], name: string, newDate: string): void {
  const item = list.find((h) => h.name === name);
  if (item) item.date = newDate;
}

/** 指定日が祝日ならその名前を返す */
export function holidayName(dateStr: string): string | null {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const found = getHolidays(year).find((h) => h.date === dateStr);
  return found ? found.name : null;
}
