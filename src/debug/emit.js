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
 *   action:end         payload = { action, duration } → 仅写事件
 *   action:error       payload = { action, duration, error } → 仅写事件
 *   state:set          payload = { key, value }   → 仅写事件
 *   state:patch        payload = { patch }        → 仅写事件
 */

import {
  isDev,
  nextId,
  addStore,
  updateStore,
  addEvent,
} from './registry.js';

// ---- helpers ----

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
    return null;
  }
}

// Re-export：让 index.js 只需要 import 一个 debug 入口
export { nextId } from './registry.js';