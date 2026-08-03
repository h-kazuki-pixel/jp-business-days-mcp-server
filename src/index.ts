#!/usr/bin/env node
/**
 * jp-business-days-mcp-server
 * 日本の営業日計算(祝日・土日を除く)をClaudeに提供するMCPサーバー
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { isBusinessDay, addBusinessDays, businessDaysBetween } from "./businessDays.js";

const WEEKDAYS_JP = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で指定してください")
  .describe("日付(YYYY-MM-DD形式。例: 2026-07-20)");

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function validDate(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dateStr) {
    throw new Error(`存在しない日付です: ${dateStr}`);
  }
  return d;
}

function weekdayOf(dateStr: string): string {
  return WEEKDAYS_JP[validDate(dateStr).getUTCDay()];
}

const server = new McpServer({ name: "jp-business-days-mcp-server", version: "1.0.0" });

server.registerTool(
  "jp_is_business_day",
  {
    title: "営業日判定",
    description:
      "指定した日付が営業日(平日かつ祝日でない日)かどうかを判定します。土日・祝日の場合は、その理由(曜日名または祝日名)も返します。日付を省略すると今日(日本時間)を判定します。対応範囲: 2020〜2099年。",
    inputSchema: {
      date: dateSchema.optional().describe("判定したい日付(省略時は今日・日本時間)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ date }) => {
    const target = date ?? todayJst();
    validDate(target);
    const check = isBusinessDay(target);
    const output = {
      date: target,
      weekday: weekdayOf(target),
      isBusinessDay: check.isBusinessDay,
      reason: check.reason,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  }
);

server.registerTool(
  "jp_add_business_days",
  {
    title: "N営業日後/前の日付",
    description:
      "指定日からN営業日後(daysが正の数)、またはN営業日前(daysが負の数)の日付を計算します。土日・祝日はカウントしません。起点日自体はカウントに含みません。daysに0は指定できません。日付を省略すると今日(日本時間)が起点になります。",
    inputSchema: {
      date: dateSchema.optional().describe("起点の日付(省略時は今日・日本時間)"),
      days: z
        .number()
        .int()
        .min(-250)
        .max(250)
        .refine((v) => v !== 0, { message: "daysに0は指定できません" })
        .describe("営業日数。正の数=後の日付、負の数=前の日付(例: 5, -3)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ date, days }) => {
    const start = date ?? todayJst();
    validDate(start);
    const result = addBusinessDays(start, days);
    const output = {
      from: start,
      days,
      result,
      resultWeekday: weekdayOf(result),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  }
);

server.registerTool(
  "jp_business_days_between",
  {
    title: "2日付間の営業日数",
    description:
      "開始日から終了日まで(両端を含む)の営業日数をカウントします。開始日は終了日以前である必要があります。",
    inputSchema: {
      start: dateSchema.describe("開始日(YYYY-MM-DD)"),
      end: dateSchema.describe("終了日(YYYY-MM-DD、開始日以降)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ start, end }) => {
    validDate(start);
    validDate(end);
    const count = businessDaysBetween(start, end);
    const output = { start, end, businessDays: count };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  }
);

server.registerTool(
  "jp_calc_deadline",
  {
    title: "期限からの逆算日を計算",
    description:
      "有効期限・締切日などの基準日から、指定した営業日数だけ前の「対応期限日」を計算します。「基準日のX営業日前までに提出・対応する」という管理(更新期限のリマインダー設定など)に使えます。土日・祝日は数えず、実際に動ける営業日ベースで逆算します。",
    inputSchema: {
      referenceDate: dateSchema.describe("基準日(有効期限・締切日など、YYYY-MM-DD)"),
      businessDaysBefore: z
        .number()
        .int()
        .min(1)
        .max(250)
        .describe("基準日の何営業日前までに対応するか(例: 10)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ referenceDate, businessDaysBefore }) => {
    validDate(referenceDate);
    const deadline = addBusinessDays(referenceDate, -businessDaysBefore);
    const deadlineWeekday = weekdayOf(deadline);
    const calendarDaysBefore = Math.round(
      (new Date(referenceDate + "T00:00:00Z").getTime() -
        new Date(deadline + "T00:00:00Z").getTime()) /
        86400000
    );
    const output = {
      referenceDate,
      businessDaysBefore,
      deadline,
      deadlineWeekday,
      calendarDaysBefore,
      note: `${referenceDate}の${businessDaysBefore}営業日前は ${deadline}(${deadlineWeekday}) です`,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("jp-business-days-mcp-server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
