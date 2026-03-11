/*!
 * vue-page-store v0.1.0
 * (c) 2026 weijianjun
 * @license MIT
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.VuePageStore = {}));
})(this, (function (exports) { 'use strict';

  /**
   * vue-page-store - Vue 2.6 页面级 Store
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
  const storeRegistry = new Map();

  function createStoreInstance(Vue, id, options) {
    const initialState = options.state();
    const getters = options.getters || {};
    const actions = options.actions || {};

    // --- 用一个隐藏的 Vue 实例承载响应式 state + computed getters ---
    const computedDefs = {};
    const store = { _disposed: false };

    Object.keys(getters).forEach(function (key) {
      computedDefs[key] = function () {
        return getters[key].call(store);
      };
    });

    const vm = new Vue({
      data: function () {
        return { $$state: initialState };
      },
      computed: computedDefs,
    });

    const rawState = vm.$data.$$state;

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
    const watches = options.watch || {};
    Object.entries(watches).forEach(function (_ref) {
      const path = _ref[0];
      const def = _ref[1];
      const handler = typeof def === 'function' ? def : def.handler;
      const watchOpts = { deep: true };
      if (typeof def === 'object' && def.immediate) watchOpts.immediate = true;
      const expr = function () {
        return path.split('.').reduce(function (obj, k) { return obj && obj[k]; }, store);
      };
      vm.$watch(expr, handler.bind(store), watchOpts);
    });

    // ====== 内置方法 ======
    store.$state = rawState;
    store.$id = id;

    /**
     * 批量更新 state（浅合并语义）
     * @param {Object|Function} partial - 要合并的对象，或 (state) => Object 函数
     */
    store.$patch = function (partial) {
      const obj = typeof partial === 'function' ? partial(rawState) : partial;
      Object.keys(obj).forEach(function (key) {
        Vue.set(rawState, key, obj[key]);
      });
    };

    /**
     * 订阅 state 变化
     * @param {Function} callback - (newState) => void
     * @returns {Function} 取消订阅函数
     */
    store.$subscribe = function (callback) {
      return vm.$watch(
        function () { return Object.assign({}, rawState); },
        callback,
        { deep: true }
      );
    };

    /**
     * 重置 state 到初始值
     */
    store.$reset = function () {
      const fresh = options.state();
      Object.keys(fresh).forEach(function (key) {
        rawState[key] = fresh[key];
      });
    };

    // ====== 内置事件总线（页面作用域隔离通信） ======
    const _listeners = {};

    /**
     * 发射事件（仅当前 store 作用域内）
     * @param {string} event - 事件名
     * @param {*} payload - 事件数据
     */
    store.$emit = function (event, payload) {
      const fns = _listeners[event];
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
        const idx = _listeners[event].indexOf(handler);
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
        const idx = _listeners[event].indexOf(handler);
        if (idx > -1) _listeners[event].splice(idx, 1);
      } else {
        delete _listeners[event];
      }
    };

    /**
     * 销毁 store —— 清空事件、销毁 vm、移除注册
     */
    store.$destroy = function () {
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
   * @param {Object} options - { state, getters, actions, watch }
   * @returns {Function} useStore - 调用即获取 / 创建 store 实例
   *
   * @example
   * const useFunnelStore = definePageStore('funnelDetail', {
   *   state: () => ({ filters: {}, loading: false }),
   *   getters: {
   *     isReady() { return !this.loading; }
   *   },
   *   actions: {
   *     async fetchData() { ... }
   *   }
   * });
   *
   * // 组件中
   * const store = useFunnelStore();
   * store.fetchData();
   *
   * // 页面销毁时
   * store.$destroy();
   */
  function definePageStore(id, options) {
    if (!id || typeof options.state !== 'function') {
      throw new Error('[vue-page-store] 需要 id 和 state 函数');
    }

    // 缓存 Vue 引用，首次调用时从 store 的 vm 实例获取
    let _Vue = null;

    return function useStore() {
      if (storeRegistry.has(id)) {
        return storeRegistry.get(id);
      }

      // 自动获取 Vue 构造函数
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

      const store = createStoreInstance(_Vue, id, options);
      storeRegistry.set(id, store);
      return store;
    };
  }

  /**
   * 将 store 的 state 属性转为可在模板中使用的 refs 对象
   *
   * @param {Object} store - pageStore 实例
   * @returns {Object} refs 对象（可解构赋值到 computed）
   *
   * @example
   * const { filters, loading } = storeToRefs(store);
   */
  function storeToRefs(store) {
    const refs = {};
    Object.keys(store.$state).forEach(function (key) {
      Object.defineProperty(refs, key, {
        enumerable: true,
        get: function () { return store[key]; },
        set: function (val) { store[key] = val; },
      });
    });
    return refs;
  }
  var index = { definePageStore, storeToRefs, storeRegistry };

  exports.default = index;
  exports.definePageStore = definePageStore;
  exports.storeRegistry = storeRegistry;
  exports.storeToRefs = storeToRefs;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
