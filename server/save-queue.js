// Очередь сохранений: SQLite не на горячем пути.
// Выдача добычи и прочие частые изменения не пишутся в базу по одной: игрок попадает в очередь,
// а тик записывает всю очередь ОДНОЙ транзакцией прямо перед рассылкой. Поэтому клиент узнаёт
// об успехе (событие pickup, профиль you) только после фиксации в базе, а fsync один на тик,
// а не на каждый подбор. При сбое записи операции из очереди откатываются в памяти обратными
// действиями, их события не уходят клиенту, игрок получает отказ.
// Редкие критичные действия (торговля, заточка, изготовление, обучение, PK) пишутся сразу
// отдельной транзакцией — их результат виден только после записи, как и раньше.

// write(players) → { rejected: Set(players) } или исключение (ошибка SQLite — откат всей пачки).
export function createSaveQueue({ write, onRejected = () => {} }) {
  // игрок → операции с откатом, ожидающие записи
  const staged = new Map();
  // игроки, чей профиль нужно записать (периодическое сохранение), без отката
  const marked = new Set();
  const stats = { flushes: 0, written: 0, failed: 0, undone: 0 };

  function undo(p, ops) {
    // обратные действия в обратном порядке: последняя операция отменяется первой
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (p.a && op.events?.length) { const drop = new Set(op.events); p.a.out = p.a.out.filter((e) => !drop.has(e)); }
      try { op.undo?.(); } catch { /* откат не должен ронять тик */ }
      stats.undone++;
    }
  }

  return {
    stats,
    // Операция уже применена в памяти; undo — обратное действие, events — её события в a.out.
    stage(p, op) { if (!staged.has(p)) staged.set(p, []); staged.get(p).push(op); },
    mark(p) { marked.add(p); },
    pending: () => staged.size + marked.size,
    // Профиль игрока записан отдельно (критичная запись или выход): его очередь уже в базе.
    settle(p) { staged.delete(p); marked.delete(p); },
    // Записать всё одной транзакцией. true — очередь пуста или записана.
    flush() {
      if (!staged.size && !marked.size) return true;
      const players = [...new Set([...staged.keys(), ...marked])].filter((p) => p.key && p.a);
      stats.flushes++;
      let rejected;
      try { rejected = write(players).rejected; }
      catch (error) {
        // вся пачка не записана: откатываем операции, периодическую запись повторим в следующий тик
        stats.failed++;
        for (const [p, ops] of staged) { undo(p, ops); onRejected(p, error); }
        staged.clear();
        return false;
      }
      for (const p of players) {
        if (rejected.has(p)) { const ops = staged.get(p); if (ops) undo(p, ops); onRejected(p, null); continue; }
        stats.written++;
      }
      staged.clear(); marked.clear();
      return rejected.size === 0;
    },
  };
}
