# vue-page-store

> Vue 2.6 页面级 Store —— 状态、通信、生命周期，一个作用域全收。

## 为什么需要它？

在微前端架构（single-spa / qiankun）下，复杂页面（仪表盘、漏斗分析、数据详情）的状态管理面临一个尴尬处境：

| 方案 | 问题 |
|------|------|
| **Vuex** | 全局 store，页面销毁后状态残留，命名冲突，不适合页面级生命周期 |
| **全局 EventBus** | 命名冲突、手动 $off 容易遗漏、事件扩散到全局 |
| **provide / inject** | 只传数据，不管通信和副作用 |
| **组件 data** | 跨组件共享困难，深层传递 props 地狱 |

`vue-page-store` 解决的就是这个中间地带：**页面内部需要共享状态 + 通信 + 副作用管理，但不应该污染全局。**

## 核心特性

- **页面级作用域隔离** — 每个 store 独立一份 state 和事件，互不干扰
- **`$destroy` 一键回收** — 页面销毁时自动清空 state、watchers、事件监听，零泄漏
- **API 对齐 Pinia** — `state` / `getters` / `actions` / `$patch` / `$subscribe` / `$reset`，零学习成本
- **内置作用域事件** — `$emit` / `$on` / `$off` 限定在当前 store 内，替代全局 EventBus
- **声明式 watch** — 页面级副作用自动绑定生命周期
- **TypeScript 支持** — 开箱即用的类型定义

## 安装

```bash
npm install vue-page-store
```

> **前置条件**：项目中已安装 `vue@^2.6.0`

## 快速上手

### 1. 定义 Store

```javascript
// store.js
import { definePageStore } from 'vue-page-store';

export const useFunnelStore = definePageStore('funnelDetail', {
  state: () => ({
    filters: { dateRange: [], platform: '' },
    loading: false,
    funnelSteps: [],
  }),

  getters: {
    isReady() {
      return !this.loading && this.funnelSteps.length > 0;
    },
  },

  actions: {
    async fetchData() {
      this.loading = true;
      try {
        this.funnelSteps = await api.getFunnelSteps(this.filters);
      } finally {
        this.loading = false;
      }
    },
  },

  watch: {
    'filters.platform'(newVal) {
      // platform 变了自动重新拉数据
      this.fetchData();
    },
  },
});
```

### 2. 组件中使用

```javascript
// 任意子组件
export default {
  computed: {
    store() {
      return useFunnelStore();
    },
    isReady() {
      return this.store.isReady;
    },
  },
  methods: {
    handleSearch() {
      this.store.$patch({ filters: this.localFilters });
      this.store.fetchData();
    },
  },
};
```

### 3. 页面内通信

```javascript
// 组件 A —— 发射事件
this.store.$emit('filter:change', newFilters);

// 组件 B —— 监听事件
const off = this.store.$on('filter:change', (filters) => {
  this.applyFilters(filters);
});

// 无需手动清理 —— $destroy 时自动回收
```

### 4. 页面销毁时回收

```javascript
// 页面根组件
export default {
  beforeDestroy() {
    useFunnelStore().$destroy();
  },
};
```

## API

### `definePageStore(id, options)`

定义一个页面级 Store，返回 `useStore` 函数。

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `options.state` | `() => Object` | 返回初始 state 的工厂函数 |
| `options.getters` | `Object` | 计算属性，`this` 指向 store |
| `options.actions` | `Object` | 方法，`this` 指向 store |
| `options.watch` | `Object` | 声明式侦听，支持点路径 `'a.b.c'` |

### Store 实例方法

| 方法 | 说明 |
|------|------|
| `$patch(partial)` | 浅合并更新 state，接受对象或 `(state) => Object` 函数 |
| `$subscribe(cb)` | 订阅 state 变化，返回取消函数 |
| `$reset()` | 重置 state 到初始值 |
| `$emit(event, payload?)` | 发射事件（仅当前 store 作用域） |
| `$on(event, handler)` | 订阅事件，返回取消函数 |
| `$off(event, handler?)` | 取消事件订阅（不传 handler 则取消该事件全部监听） |
| `$destroy()` | 销毁 store，回收所有资源 |

### `storeToRefs(store)`

将 store 的 state 属性转为可解构的 refs 对象。

```javascript
import { storeToRefs } from 'vue-page-store';

const store = useFunnelStore();
const { filters, loading } = storeToRefs(store);
```

## 与 Pinia / Vuex 的关系

这不是 Pinia 或 Vuex 的替代品，而是补充：

| | Vuex | Pinia | vue-page-store |
|---|---|---|---|
| 作用域 | 全局 | 全局 | 页面级 |
| 生命周期 | 应用级 | 应用级 | 页面级（手动 $destroy） |
| 事件通信 | 无 | 无 | 内置 $emit/$on |
| Vue 2.6 支持 | ✅ | ⚠️ 需 @vue/composition-api | ✅ 原生支持 |
| 适用场景 | 用户信息、权限、全局配置 | 同 Vuex | 复杂页面内部状态 |

**推荐组合**：Vuex 管全局，vue-page-store 管页面。

## Vue 3

本库专为 Vue 2.6 设计。Vue 3 项目推荐使用 [Pinia](https://pinia.vuejs.org/)。

## License

[MIT](./LICENSE)
