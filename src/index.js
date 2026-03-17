/**
 * vue-page-store 0.2.0 — Vue 2.6 页面级 Store
 *
 * 状态、通信、生命周期，一个作用域全收。
 *
 * 与 Vuex 的区分：
 *   Vuex        → 全局状态（用户信息、权限、路由等）
 *   pageStore   → 页面级状态（仪表盘、漏斗详情等复杂页面内部状态）
 *                 页面销毁时 $destroy 即可回收，不污染全局
 *
 * @author weijianjun
 * @license MIT
 */

// Store 注册表（导出供调试 / devtools 使用）
var storeRegistry = new Map();

function createStoreInstance(Vue, id, options) {
  var initialState = options.state();
  var getters = options.getters || {};
  var actions = options.actions || {};
  var lifecycles = options.lifecycle || {};

  // --- 用一个隐藏的 Vue 实例承载响应式 state + computed getters ---
  var computedDefs = {};
  var store = { _disposed: false };

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
      get: function () { return rawState[key]; },
      set: function (val) { rawState[key] = val; },
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
    var handler = typeof def === 'function' ? def : def.handler;
    var watchOpts = { deep: true };
    if (typeof def === 'object' && def.immediate) watchOpts.immediate = true;
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
    var obj = typeof partial === 'function' ? partial(rawState) : partial;
    Object.keys(obj).forEach(function (key) {
      Vue.set(rawState, key, obj[key]);
    });
  };

  /**
   * 重置 state 到初始值
   */
  store.$reset = function () {
    var fresh = options.state();
    Object.keys(fresh).forEach(function (key) {
      rawState[key] = fresh[key];
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

  /**
   * 绑定到组件实例，自动挂载生命周期
   *
   * 原理：Vue 2 的 vm.$on('hook:xxx') 可监听组件自身生命周期事件，
   * 这是 Vue 2 内置能力，不是 hack。
   *
   * 时序保证：
   *   无 keep-alive → mounted → beforeDestroy
   *   有 keep-alive → mounted → activated ⇄ deactivated → beforeDestroy
   *
   * 必须在 created 中调用（mounted 之前），否则 hook:mounted 捕获不到。
   *
   * @param {Vue} componentVm - 组件实例（通常传 this）
   * @returns {Object} store - 支持链式调用
   */
  store.bindTo = function (componentVm) {
    if (store._disposed) return store;

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
    if (store._disposed) return;

    rawStatus.mounted = false;
    rawStatus.active = false;
    runHook('unmount');

    store._disposed = true;
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
 *   lifecycle: {
 *     mount:    function () { this.fetchData(); },
 *     unmount:  function () { console.log('bye'); },
 *     activate: function () { this.needRefresh && this.fetchData(); }
 *   }
 * });
 *
 * // 组件中（created 里传 this，自动绑定全部生命周期 + 自动销毁）
 * created() {
 *   this.store = useFunnelStore(this);
 * }
 *
 * // 不需要 lifecycle 时，不传参数，和 0.1.0 完全一样
 * this.store = useFunnelStore();
 */
function definePageStore(id, options) {
  if (!id || typeof options.state !== 'function') {
    throw new Error('[vue-page-store] 需要 id 和 state 函数');
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

export { definePageStore, storeRegistry };
export default { definePageStore, storeRegistry };