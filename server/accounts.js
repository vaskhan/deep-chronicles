// Аккаунты и сохранения: SQLite (node:sqlite), пароль — scrypt с солью, токены устройств — sha256 в базе.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const NAME_RE = /^[\p{L}\p{N}_-]{3,16}$/u;
const SAVE_MAX = 64_000;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (key TEXT PRIMARY KEY, name TEXT NOT NULL, salt BLOB NOT NULL, hash BLOB NOT NULL, created INTEGER NOT NULL, save TEXT, saved INTEGER);
    CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, key TEXT NOT NULL, created INTEGER NOT NULL);`);
  const q = {
    get: db.prepare('SELECT * FROM accounts WHERE key = ?'),
    add: db.prepare('INSERT INTO accounts (key, name, salt, hash, created, save, saved) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    save: db.prepare('UPDATE accounts SET save = ?, saved = ? WHERE key = ?'),
    tokAdd: db.prepare('INSERT INTO tokens (hash, key, created) VALUES (?, ?, ?)'),
    tokGet: db.prepare('SELECT key FROM tokens WHERE hash = ?'),
    tokDel: db.prepare('DELETE FROM tokens WHERE hash = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM accounts'),
  };
  const keyOf = (name) => String(name || '').trim().toLowerCase();
  const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  const hashPass = (pass, salt) => crypto.scryptSync(String(pass), salt, 32);
  const issue = (key) => { const token = crypto.randomBytes(24).toString('hex'); q.tokAdd.run(sha(token), key, Date.now()); return token; };
  const parse = (row) => { try { return row.save ? JSON.parse(row.save) : null; } catch { return null; } };

  // сохранение пишет сервер по итогам своей симуляции: клиентский профиль сюда не попадает
  function cleanSave(row, save) {
    if (!save || typeof save !== 'object' || Array.isArray(save)) return null;
    const s = { ...save, name: row.name, ts: Date.now() };
    const json = JSON.stringify(s);
    return json.length > SAVE_MAX ? null : json;
  }

  return {
    // при регистрации от клиента берётся только класс — персонажа создаёт сервер
    register(name, pass, cls) {
      name = String(name || '').trim();
      if (!NAME_RE.test(name)) return { err: 'Имя: 3–16 букв или цифр' };
      if (String(pass || '').length < 4 || String(pass).length > 64) return { err: 'Пароль: от 4 до 64 символов' };
      const key = keyOf(name);
      if (q.get.get(key)) return { err: 'Это имя уже занято' };
      const salt = crypto.randomBytes(16);
      const json = JSON.stringify({ cls: cls === 'mage' ? 'mage' : 'warrior' });
      q.add.run(key, name, salt, hashPass(pass, salt), Date.now(), json, Date.now());
      return { key, name, token: issue(key), save: JSON.parse(json) };
    },
    login(name, pass) {
      const row = q.get.get(keyOf(name));
      if (!row || !crypto.timingSafeEqual(Buffer.from(row.hash), hashPass(pass, Buffer.from(row.salt)))) return { err: 'Неверное имя или пароль' };
      return { key: row.key, name: row.name, token: issue(row.key), save: parse(row) };
    },
    byToken(token) {
      const t = q.tokGet.get(sha(token));
      const row = t && q.get.get(t.key);
      if (!row) return { err: 'Сессия устарела — войдите заново' };
      return { key: row.key, name: row.name, save: parse(row) };
    },
    logout(token) { q.tokDel.run(sha(token)); },
    store(key, save) {
      const row = q.get.get(key); if (!row) return false;
      const json = cleanSave(row, save); if (!json) return false;
      q.save.run(json, Date.now(), key);
      return true;
    },
    // Несколько профилей одной транзакцией: передача вещи между игроками либо записана у обоих,
    // либо ни у кого. false — профиль не прошёл проверку (нет аккаунта, превышен SAVE_MAX).
    storeMany(list) {
      const rows = [];
      for (const [key, save] of list) {
        const row = q.get.get(key), json = row && cleanSave(row, save);
        if (!json) return false;
        rows.push([key, json]);
      }
      const now = Date.now();
      db.exec('BEGIN IMMEDIATE');
      try { for (const [key, json] of rows) q.save.run(json, now, key); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
      return true;
    },
    load(key) { const row = q.get.get(key); return row ? parse(row) : null; },
    count: () => q.count.get().n,
    close: () => db.close(),
  };
}
