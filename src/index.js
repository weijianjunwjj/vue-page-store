/*!
 * vue-page-store v0.3.0
 * (c) 2026 weijianjun
 * @license MIT
 */
/**
 * vue-page-store 0.3.0 — Vue 2.6 Page Scope Runtime
 *
 * 页面级作用域运行时容器：
 * state · getters · actions · watch · lifecycle · event bus
 *
 * 与 Vuex 的区分：
 *   Vuex        → 全局状态（用户信息、权限、路由等）
 *   pageStore   → 页面级作用域（仪表盘、漏斗详情等复杂页面内部状态）
 *                 页面销毁时 $destroy 即可回收，不污染全局
 *
 * @author weijianjun
 * @license MIT
 */

// Store 注册表（导出供调试 / devtools 使用）
var storeRegistry = new Map();

// ====== dev-only warning ======
var isDev = typeof process !== 'undefined'
  && process.env
  && process.env.NODE_ENV !== 'production';

function warn(msg) {
  if (isDev) {
    console.warn('[vue-page-store] ' + msg);
  }
}

function createStoreInstance(Vue, id, options) {
  var initialState = options.state();
  var getters = options.getters || {};
  var actions = options.actions || {};
  var lifecycles = options.lifecycle || {};

  // --- 用一个隐藏的 Vue 实例承载响应式 state + computed getters ---
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
        $$status: {
          mounted: false,
          active: false
        }
      };
    },
    computed: computedDefs,
  });

  var rawState = vm.$data.$$state;
  var rawStatus = vm.$data.$$status;

  // ====== state —— 代理到 vm.$$state ======
  Object.keys(initialState).forEach(function (key) {
    Object.defineProperty(store, key, {
      enumerable: true,
      configurable: true,
      get: function () { return rawState[key]; },
      set: function (val) {
        if (store.$disposed) {
          warn('store "' + id + '" 已销毁，忽略对 "' + key + '" 的写入');
          return;
        }
        rawState[key] = val;
      },
    });
  });

  // ====== getters —— 代理到 vm computed ======
  Object.keys(getters).forEach(function (key) {
    Object.defineProperty(store, key, {
      enumerable: true,
      get: function () { return vm[key]; },
    });
  });

  // ====== actions ======
  Object.keys(actions).forEach(function (key) {
    store[key] = actions[key].bind(store);
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
      // v0.3: deep 默认 false，需要显式开启
      watchOpts = {};
      if (def.deep) watchOpts.deep = true;
      if (def.immediate) watchOpts.immediate = true;

      if (!handler) {
        warn(
          'watch "' + path + '" in store "' + id + '" 缺少 handler，该 watcher 将被跳过'
        );
        return;
      }
    }

    var expr = function () {
      return path.split('.').reduce(function (obj, k) { return obj && obj[k]; }, store);
    };
    vm.$watch(expr, handler.bind(store), watchOpts);
  });

  // ====== 内置方法 ======
  store.$state = rawState;
  store.$status = rawStatus;
  store.$id = id;

  /**
   * 批量更新 state（浅合并语义）
   * @param {Object|Function} partial - 要合并的对象，或 (state) => Object 函数
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
   * 重置 state 到初始值
   *
   * v0.3 语义：完全恢复到 state() 的 shape
   *   - 初始字段恢复为新鲜值
   *   - 运行时动态新增的字段被移除
   */
  store.$reset = function () {
    var fresh = options.state();

    // 1. 恢复初始字段
    Object.keys(fresh).forEach(function (key) {
      Vue.set(rawState, key, fresh[key]);
    });

    // 2. 删除不在初始 shape 中的字段
    Object.keys(rawState).forEach(function (key) {
      if (!(key in fresh)) {
        Vue.delete(rawState, key);
      }
    });
  };

  // ====== 内置事件总线（页面作用域隔离通信） ======
  var _listeners = {};

  /**
   * 发射事件（仅当前 store 作用域内）
   * @param {string} event - 事件名
   * @param {*} payload - 事件数据
   */
  store.$emit = function (event, payload) {
    var fns = _listeners[event];
    if (fns) fns.slice().forEach(function (fn) { fn(payload); });
  };

  /**
   * 订阅事件
   * @param {string} event - 事件名
   * @param {Function} handler - 处理函数
   * @returns {Function} 取消订阅函数
   */
  store.$on = function (event, handler) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(handler);
    return function () {
      if (!_listeners[event]) return;
      var idx = _listeners[event].indexOf(handler);
      if (idx > -1) _listeners[event].splice(idx, 1);
    };
  };

  /**
   * 取消订阅指定事件的所有 handler，或指定 handler
   * @param {string} event - 事件名
   * @param {Function} [handler] - 可选，指定取消某个 handler
   */
  store.$off = function (event, handler) {
    if (!_listeners[event]) return;
    if (handler) {
      var idx = _listeners[event].indexOf(handler);
      if (idx > -1) _listeners[event].splice(idx, 1);
    } else {
      delete _listeners[event];
    }
  };

  // ====== 页面生命周期 ======

  /** 触发生命周期钩子 + 广播事件 */
  function runHook(name, payload) {
    var hook = lifecycles[name];
    if (typeof hook === 'function') {
      hook.call(store, payload);
    }
    store.$emit('page:' + name, payload);
  }

  // ====== bindTo 去重标记 ======
  var _boundVms = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

  /**
   * 绑定到组件实例，自动挂载生命周期 + 自动 provide
   *
   * v0.3:
   *   - 同一个 vm 重复绑定会被安全跳过
   *   - 自动 provide('pageStore', store)，子组件 inject: ['pageStore'] 即可获取
   *
   * 必须在 created 中调用（mounted 之前），否则 hook:mounted 捕获不到。
   *
   * @param {Vue} componentVm - 组件实例（通常传 this）
   * @returns {Object} store - 支持链式调用
   */
  store.bindTo = function (componentVm) {
    if (store.$disposed) return store;

    // 去重：同一个 vm 只绑定一次
    if (_boundVms) {
      if (_boundVms.has(componentVm)) return store;
      _boundVms.add(componentVm);
    }

    // 自动 provide —— 子组件 inject: ['pageStore'] 即可获取
    var provided = componentVm._provided || (componentVm._provided = {});
    provided['pageStore'] = store;

    componentVm.$on('hook:mounted', function () {
      rawStatus.mounted = true;
      rawStatus.active = true;
      runHook('mount');
    });

    componentVm.$on('hook:activated', function () {
      rawStatus.active = true;
      runHook('activate');
    });

    componentVm.$on('hook:deactivated', function () {
      rawStatus.active = false;
      runHook('deactivate');
    });

    componentVm.$on('hook:beforeDestroy', function () {
      store.$destroy();
    });

    return store;
  };

  // ====== $destroy ======

  /**
   * 销毁 store —— 触发 unmount 钩子、清空事件、销毁 vm、移除注册
   */
  store.$destroy = function () {
    if (store.$disposed) return;

    rawStatus.mounted = false;
    rawStatus.active = false;
    runHook('unmount');

    store.$disposed = true;
    Object.keys(_listeners).forEach(function (key) { delete _listeners[key]; });
    vm.$destroy();
    storeRegistry.delete(id);
  };

  store._vm = vm;

  return store;
}

/**
 * 定义页面级 Store
 *
 * 当前版本采用 id → singleton 实例模型：
 *   同一个 id 在整个应用生命周期内对应唯一一个 store 实例。
 *   适用于单页单作用域 / keep-alive 缓存场景。
 *   多实例 / keyed instance 将在未来版本支持。
 *
 * @param {string} id - 唯一标识
 * @param {Object} options - { state, getters, actions, watch, lifecycle }
 * @returns {Function} useStore(vm?) - 调用即获取 / 创建 store 实例
 *
 * @example
 * var useFunnelStore = definePageStore('funnelDetail', {
 *   state: function () { return { filters: {}, loading: false }; },
 *   getters: {
 *     isReady: function () { return !this.loading; }
 *   },
 *   actions: {
 *     fetchData: async function () { ... }
 *   },
 *   watch: {
 *     // v0.3: 默认 shallow watch，需要 deep 请显式声明
 *     'filters': { handler: function (v) { this.fetchData(); }, deep: true }
 *   },
 *   lifecycle: {
 *     mount:    function () { this.fetchData(); },
 *     unmount:  function () { console.log('bye'); },
 *     activate: function () { this.needRefresh && this.fetchData(); }
 *   }
 * });
 *
 * // 页面组件（created 里传 this，自动绑定生命周期 + 自动 provide + 自动销毁）
 * created() {
 *   this.pageStore = useFunnelStore(this);
 * }
 *
 * // 子组件（inject 即可获取，不需要 import store 文件）
 * inject: ['pageStore']
 *
 * // 不需要 lifecycle 时，不传参数，和 0.1.0 完全一样
 * this.pageStore = useFunnelStore();
 */
function definePageStore(id, options) {
  // 入参校验
  if (!id || typeof id !== 'string') {
    throw new Error('[vue-page-store] definePageStore 需要一个非空字符串作为 id');
  }
  if (!options || typeof options.state !== 'function') {
    throw new Error('[vue-page-store] definePageStore("' + id + '") 需要 state 为函数');
  }

  var _Vue = null;

  return function useStore(componentVm) {
    if (storeRegistry.has(id)) {
      var existing = storeRegistry.get(id);
      if (componentVm) existing.bindTo(componentVm);
      return existing;
    }

    if (!_Vue) {
      try {
        _Vue = require('vue');
        if (_Vue.default) _Vue = _Vue.default;
      } catch (e) {
        throw new Error(
          '[vue-page-store] 无法自动获取 Vue，请确保 vue 已安装'
        );
      }
    }

    var store = createStoreInstance(_Vue, id, options);
    storeRegistry.set(id, store);
    if (componentVm) store.bindTo(componentVm);
    return store;
  };
}
var index = { definePageStore, storeRegistry };

export { index as default, definePageStore, storeRegistry };