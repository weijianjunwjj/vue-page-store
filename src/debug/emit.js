/**
 * vue-page-store debug / emit
 *
 * 唯一对外高层入口：
 *   emitDebugEvent(store, type, payload)
 *
 * 职责：
 *   1. 把一次领域调用写入 events 时间线（带 seq + ts）
 *   2. 对特定 type 顺带同步 stores meta（create / destroy / lifecycle）
 *   3. payload 做序列化快照，避免后续持有活引用
 *   4. 仅 dev 生效；任何异常一律吞掉，绝不拖累业务
 *
 * 支持的 type：
 *   store:create       payload = { name? }        → addStore(meta)
 *   store:destroy      payload = undefined        → updateStore(id, { destroyed: true, active: false })
 *   lifecycle:init     payload = undefined        → updateStore(id, { route })
 *   lifecycle:enter    payload = undefined        → updateStore(id, { active: true, route })
 *   lifecycle:leave    payload = undefined        → updateStore(id, { active: false })
 *   action:start       payload = { action, args } → 仅写事件
 *   action:end         payload = { action, duration, result? } → 仅写事件
 *   action:error       payload = { action, duration, error }   → 仅写事件
 *   state:set          payload = { key, value }   → 仅写事件
 *   state:patch        payload = { patch }        → 仅写事件
 *
 * meta 同步选择 updateStore 而非 removeStore：store:destroy 后保留 meta 并标记
 * destroyed:true，让调试者能看到销毁瞬间的现场。物理删除交由 removeStore 手动调用。
 */

import {
  isDev,
  nextId,
  addStore,
  updateStore,
  addEvent,
} from './registry.js';

// ---- helpers ----

/**
 * 不依赖 Vue —— 只是运行时读 store.$vm.$route 字段，装了 vue-router 就有。
 */
function readRoute(store) {
  try {
    var vm = store && store.$vm;
    if (vm && vm.$route) {
      return {
        path: vm.$route.path,
        fullPath: vm.$route.fullPath,
        name: vm.$route.name,
      };
    }
  } catch (e) { /* ignore */ }
  return null;
}

/**
 * payload 序列化快照。
 * 事件是时间线数据，必须拷贝"当下值"，不能持活引用（否则面板看的是现在的值）。
 * 循环引用 / 不可序列化对象降级为占位符字符串，不抛错。
 */
function snapshot(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  var t = typeof v;
  if (t === 'function') return '[Function]';
  if (t !== 'object') return v;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (e) {
    return '[Unserializable]';
  }
}

// ---- 主入口 ----

export function emitDebugEvent(store, type, payload) {
  if (!isDev) return null;

  try {
    var id = store && store.$id;

    // 必要的 meta 同步
    switch (type) {
      case 'store:create':
        addStore({
          id: id,
          name: (payload && payload.name) || id,
          route: readRoute(store),
          createdAt: Date.now(),
          active: false,
          destroyed: false,
          keepAlive: false,
          storeRef: store,
        });
        break;
      case 'store:destroy':
        updateStore(id, { destroyed: true, active: false });
        break;
      case 'lifecycle:init':
        updateStore(id, { route: readRoute(store) });
        break;
      case 'lifecycle:enter':
        updateStore(id, { active: true, route: readRoute(store) });
        break;
      case 'lifecycle:leave':
        updateStore(id, { active: false });
        break;
      default:
        // action:* / state:* 只写事件流，不动 meta
        break;
    }

    var event = {
      seq: nextId(),
      ts: Date.now(),
      storeId: id,
      type: type,
      payload: snapshot(payload),
    };
    addEvent(event);
    return event;
  } catch (e) {
    // 埋点自身出错绝不能影响业务
    return null;
  }
}