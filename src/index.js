/*!
 * vue-page-store v0.5.0
 * (c) 2026 weijianjun
 * @license MIT
 */
/**
 * vue-page-store 0.5.0 — Vue 2.6 Page Scope Runtime
 *
 * 页面级作用域运行时容器：
 * source · state · getters · actions · watch · init/enter/leave · $setInterval · event bus · plugin
 *
 * v0.4 新增：
 *   source     → 页面输入 / 原始返回，和业务 state 分开
 *   enter/leave → 替换 v0.3 lifecycle，统一页面可见性语义
 *   $setInterval → 页面级 timer 托管，leave 时自动清理
 *   $loading    → async action 自动追踪 loading 状态
 *
 * v0.4.1 新增：
 *   init       → store 创建后一次性初始化钩子，$vm 已可用
 *
 * v0.5 新增：
 *   plugin     → registerPlugin 注册外部扩展，声明字段 + 生命周期钩子
 *
 * @author weijianjun
 * @license MIT
 */

import Vue from 'vue';
import * as debug from './debug/emit.js';

// ====== dev-only warning ======
var isDev =
  typeof process !== 'undefined' &&
  process.env &&
  process.env.NODE_ENV !== 'production';

function warn(msg) {
  if (isDev) {
    console.warn('[vue-page-store] ' + msg);
  }
}

function _now() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}
function wrapAction(store, name, boundFn) {
  return function () {
    var args = Array.prototype.slice.call(arguments);
    var t0 = _now();
    debug.emitDebugEvent(store, 'action:start', { action: name, args: args });
    var result;
    try {
      result = boundFn.apply(null, args);
    } catch (syncErr) {
      debug.emitDebugEvent(store, 'action:error', {
        action: name,
        duration: +(_now() - t0).toFixed(2),
        error: (syncErr && syncErr.message) || String(syncErr),
      });
      throw syncErr;
    }
    if (result && typeof result.then === 'function') {
      Promise.resolve(result).then(
        function () {
          debug.emitDebugEvent(store, 'action:end', {
            action: name,
            duration: +(_now() - t0).toFixed(2),
          });
        },
        function (err) {
          debug.emitDebugEvent(store, 'action:error', {
            action: name,
            duration: +(_now() - t0).toFixed(2),
            error: (err && err.message) || String(err),
          });
        },
      );
    } else {
      debug.emitDebugEvent(store, 'action:end', {
        action: name,
        duration: +(_now() - t0).toFixed(2),
      });
    }
    return result;
  };
}

// Store 注册表（导出供调试 / devtools 使用）
var storeRegistry = new Map();

// v0.5 新增：dev 环境自动挂到 window，方便控制台调试
if (isDev && typeof window !== 'undefined') {
  window.__VUE_PAGE_STORE__ = {
    registry: storeRegistry,
    get stores() {
      var result = {};
      storeRegistry.forEach(function (s, id) {
        result[id] = s;
      });
      return result;
    },
  };
}

// ====== v0.5 新增：plugin 机制 ======
var _plugins = [];

/**
 * 注册全局 plugin
 *
 * plugin.name 同时作为 options 字段匹配键：
 *   当 definePageStore options 中存在 options[plugin.name] 时，
 *   page-store 会调用 plugin.install(store, fieldValue, { Vue })
 *
 * install 可返回 { enter, leave, destroy } 生命周期钩子
 */
function registerPlugin(plugin) {
  if (!plugin || typeof plugin.name !== 'string') {
    throw new Error('[vue-page-store] plugin 需要一个 name 属性');
  }
  if (typeof plugin.install !== 'function') {
    throw new Error(
      '[vue-page-store] plugin "' + plugin.name + '" 需要一个 install 方法',
    );
  }
  if (
    _plugins.some(function (p) {
      return p.name === plugin.name;
    })
  ) {
    warn('plugin "' + plugin.name + '" 已注册，跳过重复注册');
    return;
  }
  _plugins.push(plugin);
}

function createStoreInstance(Vue, id, options) {
  var initialState = options.state();

  // ====== v0.4 新增：source ======
  var initialSource =
    typeof options.source === 'function' ? options.source() : {};

  var getters = options.getters || {};
  var actions = options.actions || {};

  // ====== v0.4 变更：enter/leave 替换 lifecycle ======
  var enterHook = typeof options.enter === 'function' ? options.enter : null;
  var leaveHook = typeof options.leave === 'function' ? options.leave : null;

  // ====== v0.5 新增：plugin hooks 闭包存储（由 install 填充） ======
  var _pluginHooks = [];

  // --- 用一个隐藏的 Vue 实例承载响应式 state + source + loading + computed getters ---
  var computedDefs = {};
  var store = { $disposed: false };

  Object.keys(getters).forEach(function (key) {
    computedDefs[key] = function () {
      return getters[key].call(store);
    };
  });

  var vm = new Vue({
    data: function () {
      return {
        $$state: initialState,
        $$source: initialSource, // v0.4 新增
        $$loading: {}, // v0.4 新增
        $$status: {
          mounted: false,
          active: false,
        },
      };
    },
    computed: computedDefs,
  });

  var rawState = vm.$data.$$state;
  var rawSource = vm.$data.$$source; // v0.4 新增
  var rawLoading = vm.$data.$$loading; // v0.4 新增
  var rawStatus = vm.$data.$$status;

  // ====== state —— 代理到 vm.$$state ======
  Object.keys(initialState).forEach(function (key) {
    Object.defineProperty(store, key, {
      enumerable: true,
      configurable: true,
      get: function () {
        return rawState[key];
      },
      set: function (val) {
        if (store.$disposed) {
          warn('store "' + id + '" 已销毁，忽略对 "' + key + '" 的写入');
          return;
        }
        rawState[key] = val;
      },
    });
  });

  // ====== v0.4 新增：$source —— 代理到 vm.$$source ======
  store.$source = rawSource;

  // ====== v0.4 新增：$loading —— 代理到 vm.$$loading ======
  store.$loading = rawLoading;

  // ====== getters —— 代理到 vm computed ======
  Object.keys(getters).forEach(function (key) {
    Object.defineProperty(store, key, {
      enumerable: true,
      get: function () {
        return vm[key];
      },
    });
  });

  // ====== actions —— v0.4 变更：自动增强 async action ======
  var _loadingCounts = {}; // 并发计数器，防止先返回的 finally 提前关 loading

  function finishLoading(key) {
    _loadingCounts[key]--;
    if (_loadingCounts[key] <= 0) {
      _loadingCounts[key] = 0;
      Vue.set(rawLoading, key, false);
    }
  }

  Object.keys(actions).forEach(function (key) {
    var originalFn = actions[key];
    var boundFn = originalFn.bind(store);

    var withLoading = function () {
      var result = boundFn.apply(null, arguments);

      // 检测是否返回 Promise，如果是则自动追踪 loading
      if (result && typeof result.then === 'function') {
        if (!_loadingCounts[key]) _loadingCounts[key] = 0;
        _loadingCounts[key]++;
        Vue.set(rawLoading, key, true);

        var tracked = Promise.resolve(result);
        tracked.then(
          function () {
            finishLoading(key);
          },
          function () {
            finishLoading(key);
          },
        );
      }

      return result;
    };

    store[key] = wrapAction(store, key, withLoading);
  });

  // ====== watch —— 声明式副作用，生命周期自动回收 ======
  var watches = options.watch || {};
  Object.entries(watches).forEach(function (_ref) {
    var path = _ref[0];
    var def = _ref[1];

    var handler, watchOpts;

    if (typeof def === 'function') {
      handler = def;
      watchOpts = {};
    } else {
      handler = def.handler;
      watchOpts = {};
      if (def.deep) watchOpts.deep = true;
      if (def.immediate) watchOpts.immediate = true;

      if (!handler) {
        warn(
          'watch "' +
            path +
            '" in store "' +
            id +
            '" 缺少 handler，该 watcher 将被跳过',
        );
        return;
      }
    }

    var expr = function () {
      return path.split('.').reduce(function (obj, k) {
        return obj && obj[k];
      }, store);
    };
    vm.$watch(expr, handler.bind(store), watchOpts);
  });

  // ====== 内置属性 ======
  store.$state = rawState;
  store.$status = rawStatus;
  store.$id = id;

  // v0.4 新增：$vm 逃生口，只读，bindTo 时通过内部 setter 赋值
  var _vm_ref = null;
  Object.defineProperty(store, '$vm', {
    enumerable: true,
    configurable: false,
    get: function () {
      return _vm_ref;
    },
    set: function () {
      warn('$vm 是只读属性，不允许业务侧重写');
    },
  });

  /**
   * 批量更新 state（浅合并语义）
   */
  store.$patch = function (partial) {
    if (store.$disposed) {
      warn('store "' + id + '" 已销毁，忽略 $patch 操作');
      return;
    }
    var obj = typeof partial === 'function' ? partial(rawState) : partial;
    Object.keys(obj).forEach(function (key) {
      Vue.set(rawState, key, obj[key]);
    });
  };

  /**
   * 重置 state 和 source 到初始值
   *
   * v0.4 语义：同时重置 state 和 source
   *   - 初始字段恢复为新鲜值
   *   - 运行时动态新增的字段被移除
   */
  store.$reset = function () {
    // 重置 state
    var freshState = options.state();
    Object.keys(freshState).forEach(function (key) {
      Vue.set(rawState, key, freshState[key]);
    });
    Object.keys(rawState).forEach(function (key) {
      if (!(key in freshState)) {
        Vue.delete(rawState, key);
      }
    });

    // v0.4 新增：重置 source
    var freshSource =
      typeof options.source === 'function' ? options.source() : {};
    Object.keys(freshSource).forEach(function (key) {
      Vue.set(rawSource, key, freshSource[key]);
    });
    Object.keys(rawSource).forEach(function (key) {
      if (!(key in freshSource)) {
        Vue.delete(rawSource, key);
      }
    });
  };

  // ====== 内置事件总线（页面作用域隔离通信） ======
  var _listeners = {};

  store.$emit = function (event, payload) {
    var fns = _listeners[event];
    if (fns)
      fns.slice().forEach(function (fn) {
        fn(payload);
      });
  };

  store.$on = function (event, handler) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(handler);
    return function () {
      if (!_listeners[event]) return;
      var idx = _listeners[event].indexOf(handler);
      if (idx > -1) _listeners[event].splice(idx, 1);
    };
  };

  store.$off = function (event, handler) {
    if (!_listeners[event]) return;
    if (handler) {
      var idx = _listeners[event].indexOf(handler);
      if (idx > -1) _listeners[event].splice(idx, 1);
    } else {
      delete _listeners[event];
    }
  };

  // ====== v0.4 新增：$setInterval —— 页面级 timer 托管 ======
  var _intervals = [];

  /**
   * 注册页面级 interval
   * leave 时自动清理，$destroy 时兜底清理
   *
   * @param {Function} fn - 定时执行的函数
   * @param {number} delay - 间隔毫秒数
   * @returns {Function} stop - 手动停止函数
   */
  store.$setInterval = function (fn, delay) {
    var timerId = setInterval(fn, delay);
    var entry = { id: timerId, stopped: false };
    _intervals.push(entry);

    var stop = function () {
      if (entry.stopped) return;
      clearInterval(entry.id);
      entry.stopped = true;
      var idx = _intervals.indexOf(entry);
      if (idx > -1) _intervals.splice(idx, 1);
    };

    return stop;
  };

  /** 清理所有已注册的 interval */
  function clearAllIntervals() {
    _intervals.forEach(function (entry) {
      if (!entry.stopped) {
        clearInterval(entry.id);
        entry.stopped = true;
      }
    });
    _intervals.length = 0;
  }

  // ====== v0.4 变更：enter/leave 页面生命周期 ======

  // keep-alive 防重复 enter 标记
  var _entered = false;

  function runEnter() {
    if (_entered) return;
    _entered = true;
    rawStatus.mounted = true;
    rawStatus.active = true;
    if (enterHook) {
      enterHook.call(store);
    }
    store.$emit('page:enter');
    // v0.5: plugin enter hooks
    _pluginHooks.forEach(function (h) {
      if (h.enter) h.enter();
    });
  }

  function runLeave() {
    if (!_entered) return;
    // 先清理 interval，再执行用户的 leave hook
    clearAllIntervals();
    _entered = false;
    rawStatus.active = false;
    if (leaveHook) {
      leaveHook.call(store);
    }
    store.$emit('page:leave');
    // v0.5: plugin leave hooks
    _pluginHooks.forEach(function (h) {
      if (h.leave) h.leave();
    });
  }

  // ====== bindTo 去重标记 ======
  // WeakSet 优先；fallback 用数组（IE9 等老环境）
  var _boundVms = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  var _boundVmsFallback = _boundVms ? null : [];

  function hasBoundVm(vm) {
    if (_boundVms) return _boundVms.has(vm);
    return _boundVmsFallback.indexOf(vm) > -1;
  }

  function addBoundVm(vm) {
    if (_boundVms) {
      _boundVms.add(vm);
      return;
    }
    _boundVmsFallback.push(vm);
  }

  /**
   * 绑定到组件实例
   *
   * v0.4 变更：
   *   - 挂载 $vm 引用
   *   - 使用 enter/leave 替代 v0.3 lifecycle
   *   - 自动 provide('pageStore', store)
   */
  store.bindTo = function (componentVm) {
    if (store.$disposed) return store;

    // 去重：同一个 vm 只绑定一次
    if (hasBoundVm(componentVm)) return store;
    addBoundVm(componentVm);

    // v0.4 新增：挂载 $vm 引用（通过内部变量，外部只读）
    _vm_ref = componentVm;

    // 自动 provide —— 子组件 inject: ['pageStore'] 即可获取
    var provided = componentVm._provided || (componentVm._provided = {});
    provided['pageStore'] = store;

    // v0.4 变更：enter/leave 替代 lifecycle
    componentVm.$on('hook:mounted', function () {
      runEnter();
    });

    componentVm.$on('hook:activated', function () {
      runEnter();
    });

    componentVm.$on('hook:deactivated', function () {
      runLeave();
    });

    componentVm.$on('hook:beforeDestroy', function () {
      runLeave();
      store.$destroy();
    });

    return store;
  };

  // ====== $destroy ======

  /**
   * 销毁 store
   *
   * v0.4 变更：兜底清理 interval
   * v0.5 变更：调用 plugin destroy 钩子
   */
  store.$destroy = function () {
    if (store.$disposed) return;

    rawStatus.mounted = false;
    rawStatus.active = false;

    // 兜底清理 interval（正常流程 leave 已经清过，这里防遗漏）
    clearAllIntervals();

    // v0.5: plugin destroy hooks
    _pluginHooks.forEach(function (h) {
      if (h.destroy) h.destroy();
    });

    store.$disposed = true;
    Object.keys(_listeners).forEach(function (key) {
      delete _listeners[key];
    });

    debug.emitDebugEvent(store, 'store:destroy');

    vm.$destroy();
    storeRegistry.delete(id);
  };

  store._vm = vm;

  // ====== v0.5 新增：plugin 安装 ======
  // 放在最后，此时 store 的 state/getters/actions/$源数据/$setInterval 等全部就绪
  _plugins.forEach(function (plugin) {
    var fieldValue = options[plugin.name];
    if (fieldValue === undefined) return;
    var hooks = plugin.install(store, fieldValue, { Vue: Vue });
    if (hooks) _pluginHooks.push(hooks);
  });

  return store;
}

/**
 * 定义页面级 Store
 *
 * v0.4 变更：
 *   - options 新增 source、enter、leave
 *   - options 移除 lifecycle
 *   - actions 中的 async 函数自动追踪 $loading
 * v0.4.1 变更：
 *   - options 新增 init（bindTo 之后一次性调用）
 * v0.5 变更：
 *   - options 中注册过的 plugin.name 字段会被交给对应 plugin 处理
 */
function definePageStore(id, options) {
  // 入参校验
  if (!id || typeof id !== 'string') {
    throw new Error(
      '[vue-page-store] definePageStore 需要一个非空字符串作为 id',
    );
  }
  if (!options || typeof options.state !== 'function') {
    throw new Error(
      '[vue-page-store] definePageStore("' + id + '") 需要 state 为函数',
    );
  }

  var _Vue = Vue;

  return function useStore(componentVm) {
    if (storeRegistry.has(id)) {
      var existing = storeRegistry.get(id);
      if (componentVm) existing.bindTo(componentVm);
      return existing;
    }

    var store = createStoreInstance(_Vue, id, options);
    storeRegistry.set(id, store);
    if (componentVm) store.bindTo(componentVm);

    // v0.4.1 新增：init 钩子 —— bindTo 之后调用，$vm 已可用
    if (typeof options.init === 'function') {
      options.init.call(store);
    }

    var _debugId = debug.nextId();

    Object.defineProperty(store, '_debugId', {
      value: _debugId,
      writable: false,
      enumerable: false,
      configurable: false,
    });

    debug.emitDebugEvent(store, 'store:create', { debugId: _debugId });

    return store;
  };
}

var index = {
  definePageStore: definePageStore,
  registerPlugin: registerPlugin,
  storeRegistry: storeRegistry,
};

export { index as default, definePageStore, registerPlugin, storeRegistry };
