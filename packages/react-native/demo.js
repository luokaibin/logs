import { open } from "react-native-quick-sqlite";

/**
 * react-native-quick-sqlite 使用示例（教学 Demo）
 *
 * 覆盖内容：
 * 1) 创建表
 * 2) 增删改查（CRUD）
 * 3) 事务（BEGIN/COMMIT/ROLLBACK）
 * 4) 索引
 * 5) 批量增删改查
 * 6) 常见性能优化（WAL、事务合并、分页查询、按需建索引）
 *
 * 说明：
 * - 这里用同步 API 便于理解执行顺序；请避免在高频 UI 线程中做重 SQL。
 * - 实际项目建议抽象一层 DBService，隔离 SQL 细节与错误处理。
 */

// 打开数据库（文件名可按业务命名）
const db = open({
  name: "logbeacon_demo.db",
});

/**
 * 将不同返回结构归一化为数组，兼容常见 rows 形态。
 * @param {any} result
 * @returns {any[]}
 */
function normalizeRows(result) {
  if (!result) return [];
  if (Array.isArray(result.rows)) return result.rows;
  if (Array.isArray(result?.rows?._array)) return result.rows._array;
  if (typeof result?.rows?.length === "number" && typeof result?.rows?.item === "function") {
    const list = [];
    for (let i = 0; i < result.rows.length; i += 1) {
      list.push(result.rows.item(i));
    }
    return list;
  }
  return [];
}

/**
 * 初始化数据库：常见 PRAGMA + 建表 + 建索引
 */
export function initDatabase() {
  // 性能优化 1：启用 WAL，提升并发读写与崩溃恢复表现
  db.execute("PRAGMA journal_mode = WAL;");
  // 性能优化 2：NORMAL 同步等级通常是性能与可靠性的折中
  db.execute("PRAGMA synchronous = NORMAL;");
  // 可选：临时内存区域，有助于排序场景（设备内存充足时）
  db.execute("PRAGMA temp_store = MEMORY;");

  // 创建日志表示例
  db.execute(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      status INTEGER NOT NULL DEFAULT 0
    );
  `);

  // 索引：按时间与状态检索更快（写入会有额外成本，按查询热点建立）
  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_logs_created_at
    ON logs(created_at);
  `);
  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_logs_status_created_at
    ON logs(status, created_at);
  `);
}

/**
 * 增：插入一条日志
 */
export function insertOneLog(level, content) {
  const now = Date.now();
  const result = db.execute(
    "INSERT INTO logs (level, content, created_at, status) VALUES (?, ?, ?, ?);",
    [level, content, now, 0]
  );
  return result?.insertId ?? null;
}

/**
 * 查：按 id 查询
 */
export function getLogById(id) {
  const result = db.execute("SELECT * FROM logs WHERE id = ? LIMIT 1;", [id]);
  const rows = normalizeRows(result);
  return rows[0] || null;
}

/**
 * 改：更新状态
 */
export function updateLogStatus(id, status) {
  const result = db.execute("UPDATE logs SET status = ? WHERE id = ?;", [status, id]);
  return result?.rowsAffected ?? 0;
}

/**
 * 删：按 id 删除
 */
export function deleteLogById(id) {
  const result = db.execute("DELETE FROM logs WHERE id = ?;", [id]);
  return result?.rowsAffected ?? 0;
}

/**
 * 事务示例：将多条 SQL 视为一个原子操作
 */
export function runTransactionExample() {
  try {
    db.execute("BEGIN;");

    db.execute("INSERT INTO logs (level, content, created_at, status) VALUES (?, ?, ?, ?);", [
      "info",
      "事务内插入-1",
      Date.now(),
      0,
    ]);
    db.execute("INSERT INTO logs (level, content, created_at, status) VALUES (?, ?, ?, ?);", [
      "warn",
      "事务内插入-2",
      Date.now(),
      0,
    ]);

    // 假设这里发生业务校验失败，可主动抛错触发回滚
    // throw new Error("模拟事务失败");

    db.execute("COMMIT;");
    return true;
  } catch (error) {
    db.execute("ROLLBACK;");
    console.error("[sqlite-demo] transaction rollback:", error);
    return false;
  }
}

/**
 * 批量写入：建议“批量 + 单事务”组合，避免逐条 autocommit 造成抖动
 * @param {Array<{level: string, content: string, status?: number}>} logs
 */
export function insertLogsInBatch(logs) {
  if (!Array.isArray(logs) || logs.length === 0) return 0;
  let affected = 0;

  try {
    db.execute("BEGIN;");
    for (const item of logs) {
      const result = db.execute(
        "INSERT INTO logs (level, content, created_at, status) VALUES (?, ?, ?, ?);",
        [item.level, item.content, Date.now(), item.status ?? 0]
      );
      affected += result?.rowsAffected ?? 0;
    }
    db.execute("COMMIT;");
  } catch (error) {
    db.execute("ROLLBACK;");
    throw error;
  }
  return affected;
}

/**
 * 批量查询：用分页避免一次性读太多行
 */
export function queryLogsPage(page = 1, pageSize = 50) {
  const offset = (Math.max(1, page) - 1) * pageSize;
  const result = db.execute(
    "SELECT id, level, content, created_at, status FROM logs ORDER BY id DESC LIMIT ? OFFSET ?;",
    [pageSize, offset]
  );
  return normalizeRows(result);
}

/**
 * 批量更新：把旧日志标记为已上传
 */
export function markLogsUploadedBefore(ts) {
  const result = db.execute("UPDATE logs SET status = 1 WHERE created_at <= ? AND status = 0;", [ts]);
  return result?.rowsAffected ?? 0;
}

/**
 * 批量删除：删除已上传且超过保留时间的日志
 */
export function deleteUploadedBefore(ts) {
  const result = db.execute("DELETE FROM logs WHERE created_at <= ? AND status = 1;", [ts]);
  return result?.rowsAffected ?? 0;
}

/**
 * 常见性能优化建议（可用于你们 RN LogStore 的落地）
 *
 * 1. 写入合并：10~100 条/批 + 短事务（BEGIN/COMMIT）。
 * 2. WAL：默认启用，兼顾吞吐与恢复能力。
 * 3. 索引克制：只给高频查询条件建索引，索引过多会拖慢写入。
 * 4. 分页读取：避免一次 getAll 造成大对象与主线程卡顿。
 * 5. 定期清理：按时间窗口删除历史上传日志，控制库体积。
 * 6. 参数化 SQL：统一使用 ? 占位，避免拼接导致注入与解析损耗。
 */
export function performanceTips() {
  return "请查看 demo.js 中 performanceTips 注释说明";
}

/**
 * 可选：退出前关闭数据库连接（按你的应用生命周期调用）
 */
export function closeDatabase() {
  if (typeof db.close === "function") {
    db.close();
  }
}

