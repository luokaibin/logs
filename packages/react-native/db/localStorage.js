import { DB } from "./database";

function assertValidKey(key) {
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new TypeError("localStorage key must be a non-empty string");
  }
}

function assertValidValue(value) {
  if (typeof value !== "string") {
    throw new TypeError("localStorage value must be a string");
  }
}

function getFirstRow(result) {
  if (!result?.rows) return null;
  if (Array.isArray(result.rows)) return result.rows[0] ?? null;
  if (Array.isArray(result.rows._array)) return result.rows._array[0] ?? null;
  if (typeof result.rows.item === "function" && result.rows.length > 0) {
    return result.rows.item(0);
  }
  return null;
}

class LocalStorage {
  /** @type {LocalStorage | null} */
  static _instance = null;
  /** @type {string} */
  static TABLE_NAME = "localStorage";
  constructor() {
    DB.execute(`
      CREATE TABLE IF NOT EXISTS ${LocalStorage.TABLE_NAME} (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      ) WITHOUT ROWID;
    `);
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  setItem(key, value) {
    assertValidKey(key);
    assertValidValue(value);
    DB.execute(
      `
      INSERT INTO ${LocalStorage.TABLE_NAME}(key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at;
      `,
      [key, value, Date.now()]
    );
  }

  /**
   * @param {string} key
   * @returns {string | null}
   */
  getItem(key) {
    assertValidKey(key);
    const result = DB.execute(`SELECT value FROM ${LocalStorage.TABLE_NAME} WHERE key = ? LIMIT 1;`, [key]);
    const row = getFirstRow(result);
    return row ? row.value : null;
  }

  /**
   * 获取全部键值对，返回对象形式：{ [key]: value }
   * @returns {Record<string, string>}
   */
  getAll() {
    const result = DB.execute(`SELECT key, value FROM ${LocalStorage.TABLE_NAME};`);
    const rows = Array.isArray(result?.rows) ? result.rows : (result?.rows?._array || []);
    const all = Object.create(null);
    for (const row of rows) {
      if (row && typeof row.key === "string" && typeof row.value === "string") {
        all[row.key] = row.value;
      }
    }
    return all;
  }

  /**
   * @param {string} key
   */
  removeItem(key) {
    assertValidKey(key);
    DB.execute(`DELETE FROM ${LocalStorage.TABLE_NAME} WHERE key = ?;`, [key]);
  }

  clear() {
    DB.execute(`DELETE FROM ${LocalStorage.TABLE_NAME};`);
  }

  static getInstance() {
    if (!this._instance) {
      this._instance = new LocalStorage();
    }
    return this._instance;
  }
}

export const localStorage = LocalStorage.getInstance();
