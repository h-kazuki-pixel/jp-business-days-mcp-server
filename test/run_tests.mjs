// jp-business-days-mcp-server の統合テスト
// 子プロセスとしてMCPサーバーを起動し、JSON-RPC(stdio)経由で各ツールを呼び出して検証する
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "..", "dist", "index.js");

let idCounter = 1;
function nextId() {
  return idCounter++;
}

function startServer() {
  const proc = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "";
  const pending = new Map();

  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch {
        // JSON以外の行(ログなど)は無視
      }
    }
  });

  function send(method, params) {
    const id = nextId();
    const req = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve) => {
      pending.set(id, resolve);
      proc.stdin.write(JSON.stringify(req) + "\n");
    });
  }

  function notify(method, params) {
    const req = { jsonrpc: "2.0", method, params };
    proc.stdin.write(JSON.stringify(req) + "\n");
  }

  return { proc, send, notify };
}

async function callTool(client, name, args) {
  const res = await client.send("tools/call", { name, arguments: args });
  if (res.error) {
    throw new Error(`RPC error for ${name}: ${JSON.stringify(res.error)}`);
  }
  const content = res.result?.content?.[0]?.text;
  return content ? JSON.parse(content) : res.result?.structuredContent;
}

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`OK   ${label}`);
    passed++;
  } else {
    console.log(`FAIL ${label}\n     expected=${e}\n     actual  =${a}`);
    failed++;
  }
}

function assertTrue(cond, label) {
  if (cond) {
    console.log(`OK   ${label}`);
    passed++;
  } else {
    console.log(`FAIL ${label}`);
    failed++;
  }
}

async function main() {
  const client = startServer();

  // MCP初期化ハンドシェイク
  await client.send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "0.0.1" },
  });
  client.notify("notifications/initialized", {});

  // --- jp_is_business_day ---
  // 2026-07-21は火曜日、祝日ではない → 営業日のはず
  let r = await callTool(client, "jp_is_business_day", { date: "2026-07-21" });
  assertEqual(r.isBusinessDay, true, "2026-07-21(火)は営業日");

  // 2026-07-19は日曜日 → 非営業日
  r = await callTool(client, "jp_is_business_day", { date: "2026-07-19" });
  assertEqual(r.isBusinessDay, false, "2026-07-19(日)は非営業日");
  assertEqual(r.reason, "日曜日", "理由は日曜日");

  // 2026-01-01は元日(祝日) → 非営業日
  r = await callTool(client, "jp_is_business_day", { date: "2026-01-01" });
  assertEqual(r.isBusinessDay, false, "2026-01-01(元日)は非営業日");
  assertEqual(r.reason, "元日", "理由は元日");

  // 2026-01-12は成人の日(月, 第2月曜) → 非営業日
  r = await callTool(client, "jp_is_business_day", { date: "2026-01-12" });
  assertEqual(r.isBusinessDay, false, "2026-01-12(成人の日)は非営業日");

  // --- jp_add_business_days ---
  // 2026-07-17(金)の1営業日後 → 週末を挟むので2026-07-21(火、7/20は海の日で祝日)
  // 事前確認: 2026-07-20は「海の日」(7月第3月曜)
  r = await callTool(client, "jp_is_business_day", { date: "2026-07-20" });
  assertEqual(r.isBusinessDay, false, "2026-07-20(海の日)は非営業日");
  assertEqual(r.reason, "海の日", "理由は海の日");

  r = await callTool(client, "jp_add_business_days", { date: "2026-07-17", days: 1 });
  assertEqual(r.result, "2026-07-21", "7/17(金)の1営業日後は7/21(火、土日+海の日をスキップ)");

  // 負の日数(前の営業日)
  r = await callTool(client, "jp_add_business_days", { date: "2026-07-21", days: -1 });
  assertEqual(r.result, "2026-07-17", "7/21(火)の1営業日前は7/17(金)");

  // days=0はエラーになるべき
  let threw = false;
  try {
    await callTool(client, "jp_add_business_days", { date: "2026-07-20", days: 0 });
  } catch (e) {
    threw = true;
  }
  assertTrue(threw, "days=0はバリデーションエラーになる");

  // --- jp_business_days_between ---
  // 2026-07-17(金)〜2026-07-21(火): 7/17金(営業), 18土, 19日, 20月祝(海の日), 21火(営業) → 営業日は2日
  r = await callTool(client, "jp_business_days_between", { start: "2026-07-17", end: "2026-07-21" });
  assertEqual(r.businessDays, 2, "7/17〜7/21の営業日数は2日(金・火のみ)");

  // 同じ日同士(営業日) → 1
  r = await callTool(client, "jp_business_days_between", { start: "2026-07-20", end: "2026-07-20" });
  assertEqual(r.businessDays, 0, "祝日同士の範囲(7/20〜7/20)は営業日0日");

  r = await callTool(client, "jp_business_days_between", { start: "2026-07-21", end: "2026-07-21" });
  assertEqual(r.businessDays, 1, "営業日同士の範囲(7/21〜7/21)は営業日1日");

  // --- jp_calc_deadline(許認可期限などのユースケース) ---
  // 基準日2026-08-31(月、平日と仮定)の10営業日前を計算
  r = await callTool(client, "jp_is_business_day", { date: "2026-08-31" });
  console.log(`     (参考) 2026-08-31 isBusinessDay=${r.isBusinessDay}`);

  r = await callTool(client, "jp_calc_deadline", {
    referenceDate: "2026-08-31",
    businessDaysBefore: 10,
  });
  assertTrue(!!r.deadline, "jp_calc_deadlineがdeadlineを返す");
  // 逆算した日から基準日まで10営業日後になっているか、add_business_daysで検算
  const check = await callTool(client, "jp_add_business_days", {
    date: r.deadline,
    days: 10,
  });
  assertEqual(check.result, "2026-08-31", "逆算結果を10営業日進めると基準日に戻る(整合性チェック)");

  // --- 対応範囲外の年 ---
  threw = false;
  try {
    await callTool(client, "jp_is_business_day", { date: "2019-12-31" });
  } catch (e) {
    threw = true;
  }
  assertTrue(threw, "対応範囲外(2019年)はエラーになる");

  console.log(`\n合計: ${passed}件成功 / ${failed}件失敗`);
  client.proc.kill();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("テスト実行エラー:", err);
  process.exit(1);
});
