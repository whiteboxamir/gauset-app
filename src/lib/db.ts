import path from "node:path";

type BetterSqlite3Module = typeof import("better-sqlite3");
type DatabaseInstance = InstanceType<BetterSqlite3Module["default"]>;

let database: DatabaseInstance | null = null;

function loadDatabaseConstructor() {
    // Keep the native binding out of Next's static route bundling.
    const runtimeRequire = eval("require") as NodeRequire;
    return runtimeRequire("better-sqlite3") as BetterSqlite3Module["default"];
}

function initializeDatabase() {
    if (database) {
        return database;
    }

    const Database = loadDatabaseConstructor();
    const dbPath = path.join(process.cwd(), "gauset.db");
    const nextDatabase = new Database(dbPath);

    nextDatabase.exec(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    database = nextDatabase;
    return database;
}

export function getDb() {
    return initializeDatabase();
}

const db = new Proxy({} as DatabaseInstance, {
    get(_target, property, receiver) {
        const value = Reflect.get(getDb() as object, property, receiver);
        return typeof value === "function" ? value.bind(getDb()) : value;
    },
});

export default db;
