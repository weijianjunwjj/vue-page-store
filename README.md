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

`vue-page-store` 解决的就是这个中间地带：**页面内部需要共享状态 + 通信 + 生命周期管理，但不应该污染全局。**

## 核心特性

- **页面级作用域隔离** — 每个 store 独立一份 state 和事件，互不干扰
- **`useStore(this)` 一行绑定** — 自动挂载生命周期，自动销毁，零手动清理
- **页面生命周期** — `mount` / `unmount` / `activate` / `deactivate`，keep-alive 原生支持
- **API 对齐 Pinia** — `state` / `getters` / `actions` / `$patch` / `$reset`，零学习成本
- **内置作用域事件** — `$emit` / `$on` / `$off` 限定在当前 store 内，替代全局 EventBus
- **声明式 watch** — 页面级副作用自动绑定生命周期

## 安装

```bash
npm install vue-page-store
```

> **前置条件**：项目中已安装 `vue@^2.6.0`

## 快速上手

### 1. 定义 Store

```javascript
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
      this.fetchData();
    },
  },

  // 0.2.0 新增：页面生命周期
  lifecycle: {
    mount() {
      // 页面挂载时自动拉数据
      this.fetchData();
    },
    unmount() {
      console.log('页面销毁');
    },
  },
});
```

### 2. 组件中使用

```javascript
export default {
  created() {
    // 传 this → 自动绑定生命周期 + 自动销毁，不需要 beforeDestroy
    this.store = useFunnelStore(this);
  },

  computed: {
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

> **不传 `this`** 也完全可以，行为和 0.1.0 一样，需要自己在 `beforeDestroy` 里调 `$destroy()`。

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

## 页面生命周期（0.2.0）

通过 `useStore(this)` 传入组件实例，store 会自动绑定到组件的生命周期：

| 组件钩子 | store 行为 | `$status` 变化 |
|----------|-----------|---------------|
| `mounted` | 调用 `lifecycle.mount` | `mounted: true, active: true` |
| `activated` | 调用 `lifecycle.activate` | `active: true` |
| `deactivated` | 调用 `lifecycle.deactivate` | `active: false` |
| `beforeDestroy` | 自动调 `$destroy()`，触发 `lifecycle.unmount` | `mounted: false, active: false` |

### 无 keep-alive

```
mounted → lifecycle.mount → ... → beforeDestroy → lifecycle.unmount
```

### 有 keep-alive

```
mounted → lifecycle.mount
  → deactivated → lifecycle.deactivate
  → activated → lifecycle.activate
  → deactivated → lifecycle.deactivate
  → activated → lifecycle.activate
  → ... 反复切换 ...
  → beforeDestroy → lifecycle.unmount
```

### keep-alive 示例

```javascript
export const useListStore = definePageStore('listPage', {
  state: () => ({
    list: [],
    needRefresh: false,
  }),

  actions: {
    async fetchList() {
      this.list = await api.getList();
      this.needRefresh = false;
    },
  },

  lifecycle: {
    mount() {
      this.fetchList();
    },
    activate() {
      // 从缓存恢复时，按需刷新
      if (this.needRefresh) this.fetchList();
    },
  },
});
```

### `$status` 响应式状态

`$status` 是响应式对象，可以直接在模板中使用：

```html
<template>
  <div v-if="store.$status.active">
    <!-- 页面激活时才渲染 -->
  </div>
</template>
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
| `options.lifecycle` | `Object` | 页面生命周期钩子 |

### `useStore(vm?)`

调用 `definePageStore` 返回的函数。

| 用法 | 行为 |
|------|------|
| `useStore()` | 获取/创建 store，手动管理生命周期（兼容 0.1.0） |
| `useStore(this)` | 获取/创建 store，自动绑定生命周期 + 自动销毁 |

### `lifecycle` 钩子

| 钩子 | 触发时机 | `this` 指向 |
|------|---------|------------|
| `mount` | 组件 `mounted` | store |
| `unmount` | 组件 `beforeDestroy`（`$destroy` 时触发） | store |
| `activate` | 组件 `activated`（keep-alive 恢复） | store |
| `deactivate` | 组件 `deactivated`（keep-alive 缓存） | store |

### Store 实例方法

| 方法 | 说明 |
|------|------|
| `$patch(partial)` | 浅合并更新 state，接受对象或 `(state) => Object` 函数 |
| `$reset()` | 重置 state 到初始值 |
| `$emit(event, payload?)` | 发射事件（仅当前 store 作用域） |
| `$on(event, handler)` | 订阅事件，返回取消函数 |
| `$off(event, handler?)` | 取消事件订阅（不传 handler 则取消该事件全部监听） |
| `$destroy()` | 销毁 store，回收所有资源 |
| `bindTo(vm)` | 手动绑定到组件实例（通常不需要，`useStore(this)` 内部调用） |

### Store 实例属性

| 属性 | 说明 |
|------|------|
| `$id` | store 唯一标识 |
| `$state` | 原始响应式 state 对象 |
| `$status` | 响应式对象 `{ mounted: boolean, active: boolean }` |

## 从 0.1.0 升级

**零破坏性变更**。0.1.0 的代码不改一行也能跑。

区别只在于你现在可以把：

```javascript
created() {
  this.store = useSomeStore();
},
beforeDestroy() {
  this.store.$destroy();
}
```

简化成：

```javascript
created() {
  this.store = useSomeStore(this);
}
```

> `storeToRefs` 和 `$subscribe` 在 0.2.0 中移除——实际项目中无使用场景，精简 API。

## 与 Pinia / Vuex 的关系

这不是 Pinia 或 Vuex 的替代品，而是补充：

| | Vuex | Pinia | vue-page-store |
|---|---|---|---|
| 作用域 | 全局 | 全局 | 页面级 |
| 生命周期 | 应用级 | 应用级 | 页面级（自动绑定） |
| 事件通信 | 无 | 无 | 内置 $emit/$on |
| Vue 2.6 支持 | ✅ | ⚠️ 需 @vue/composition-api | ✅ 原生支持 |
| 适用场景 | 用户信息、权限、全局配置 | 同 Vuex | 复杂页面内部状态 |

**推荐组合**：Vuex 管全局，vue-page-store 管页面。

## Vue 3

本库专为 Vue 2.6 设计。Vue 3 项目推荐使用 [Pinia](https://pinia.vuejs.org/)。

## License

[MIT](./LICENSE)