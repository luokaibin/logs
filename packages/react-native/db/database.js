import { open } from "react-native-quick-sqlite";

class Database {
  static _instance = null;
  static DB_NAME = "beacon-db";
  static getInstance() {
    if (!this._instance) {
      const db = open({ name: Database.DB_NAME });
      db.execute("PRAGMA journal_mode = WAL;");
      db.execute("PRAGMA synchronous = NORMAL;");
      db.execute("PRAGMA temp_store = MEMORY;");
      this._instance = db;
    }
    return this._instance;
  }
}

export const DB = Database.getInstance();