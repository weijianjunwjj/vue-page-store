/**
 * vue-page-store debug / registry
 *
 * 纯 JS 数据层：不依赖 Vue，不涉及 UI。
 *
 * 对外：
 *   window.PAGE_STORE_DEVTOOLS = { stores: Map, events: [], seq: number }
 *
 * API：
 *   nextId()                 — 递增并返回 seq
 *   addStore(meta)           — stores.set(meta.id, meta)
 *   updateStore(id, patch)   — 浅合并进已有 meta
 *   removeStore(id)          — stores.delete(id)
 *   addEvent(event)          — events.push + 环形裁剪
 *   getStores()              — 返回 Map（生产返回空 Map）
 *   getEvents()              — 返回数组（生产返回空数组）
 *
 * 仅开发环境生效。生产环境下 ensure() 返回 null，
 * 所有写 API 静默 no-op，不挂 window，不占内存。
 */

var MAX_EVENTS = 500;

// ---- isDev：稳健检测 ----
// webpack 4 / 旧 CRA 有 process；Vite / webpack 5 不 polyfill process 的情况用 try/catch 兜住。
// 额外允许 window.__VUE_PAGE_STORE_DEV__ = true 强制开启（staging 临开调试面板用）。
var _isDev = false;
try {
  if (typeof process !== 'undefined'
      && process.env
      && process.env.NODE_ENV !== 'production') {
    _isDev = true;
  }
} catch (e) { /* no process polyfill */ }
try {
  if (typeof window !== 'undefined' && window.__VUE_PAGE_STORE_DEV__ === true) {
    _isDev = true;
  }
} catch (e) { /* SSR */ }

export var isDev = _isDev;

// ---- 单例 ----
var _devtools = null;
var _empty = { stores: new Map(), events: [] }; // 生产态只读空占位，避免返回值判空

function ensure() {
  if (!isDev) return null;
  if (_devtools) return _devtools;

  _devtools = {
    stores: new Map(),
    events: [],
    seq: 0,
  };

  if (typeof window !== 'undefined') {
    try { window.PAGE_STORE_DEVTOOLS = _devtools; } catch (e) { /* locked window */ }
  }

  return _devtools;
}

// ---- API ----

export function nextId() {
  var dt = ensure();
  if (!dt) return 0;
  dt.seq++;
  return dt.seq;
}

export function addStore(meta) {
  var dt = ensure();
  if (!dt) return;
  if (!meta || !meta.id) return;
  dt.stores.set(meta.id, meta);
}

export function updateStore(id, patch) {
  var dt = ensure();
  if (!dt) return;
  if (!id || !patch) return;
  var m = dt.stores.get(id);
  if (!m) return;
  for (var k in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      m[k] = patch[k];
    }
  }
}

export function removeStore(id) {
  var dt = ensure();
  if (!dt) return;
  if (!id) return;
  dt.stores.delete(id);
}

export function addEvent(event) {
  var dt = ensure();
  if (!dt) return;
  if (!event) return;
  dt.events.push(event);
  // 环形裁剪，防止长时间开发内存无限增长
  var overflow = dt.events.length - MAX_EVENTS;
  if (overflow > 0) dt.events.splice(0, overflow);
}

export function getStores() {
  var dt = ensure();
  return dt ? dt.stores : _empty.stores;
}

export function getEvents() {
  var dt = ensure();
  return dt ? dt.events : _empty.events;
}