# vue-page-store

> Vue 2.6 页面级作用域运行时容器 —— 状态、生命周期、副作用、通信，一个作用域全收。

## 它是什么

`vue-page-store` 是面向 **复杂 Vue 2 业务页面** 的页面级运行时容器。

一个 `definePageStore` 定义一个 **Page Scope** —— 它统一管理这个页面作用域内的：

- **state** — 响应式页面状态
- **getters** — 派生计算
- **actions** — 业务逻辑
- **watch** — 声明式副作用
- **lifecycle** — 页面生命周期（mount / unmount / activate / deactivate）
- **event bus** — 页面内作用域通信

页面销毁时 `$destroy` 一键回收，不污染全局。

## 它不是什么

- **不是 Vuex / Pinia 替代品** — 全局状态（用户信息、权限、路由）请继续用 Vuex
- **不是全局状态管理方案** — 它的作用域是"页面"，不是"应用"

| | Vuex | vue-page-store |
|---|---|---|
| 作用域 | 全局 | 页面 |
| 生命周期 | 跟随应用 | 跟随页面组件 |
| 适合 | 用户信息、权限、路由状态 | 仪表盘、漏斗详情、大型配置页 |
| 销毁 | 通常不销毁 | 页面离开即回收 |

## 安装

```bash
npm install vue-page-store
```

要求 `vue@^2.6.0` 作为 peer dependency。

## 快速上手

### 1. 定义 store

```js
// stores/funnel.js
import { definePageStore } from 'vue-page-store'

export const useFunnelStore = definePageStore('funnelDetail', {
  state: () => ({
    filters: {},
    list: [],
    loading: false
  }),

  getters: {
    isEmpty() { return this.list.length === 0 },
    isReady() { return !this.loading }
  },

  actions: {
    async fetchData() {
      this.loading = true
      try {
        this.list = await api.getFunnelData(this.filters)
      } finally {
        this.loading = false
      }
    }
  },

  watch: {
    // 函数简写 — 默认浅监听
    'filters.dateRange'(val) {
      this.fetchData()
    },
    // 对象写法 — 显式 deep
    'filters': {
      handler(val) { this.fetchData() },
      deep: true
    }
  },

  lifecycle: {
    mount()    { this.fetchData() },
    unmount()  { console.log('funnel page destroyed') },
    activate() { this.fetchData() },
  }
})
```

### 2. 页面组件中使用

```js
// FunnelPage.vue
import { useFunnelStore } from './stores/funnel'

export default {
  created() {
    // 传入 this → 自动绑定生命周期 + 自动 provide + 页面销毁时自动回收
    this.pageStore = useFunnelStore(this)
  }
}
```

### 3. 子组件中使用

```js
// FilterPanel.vue — 不需要 import 任何 store 文件
export default {
  inject: ['pageStore'],
  mounted() {
    this.pageStore.fetchData()  // 直接用
  }
}
```

所有页面统一用 `this.pageStore`，所有子组件统一 `inject: ['pageStore']`。不需要知道父页面用的哪个 store 定义，零耦合。

## API

### `definePageStore(id, options)`

定义一个页面级 store，返回 `useStore(componentVm?)` 函数。

**options：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `state` | `() => Object` | **必填**，状态工厂函数 |
| `getters` | `{ [key]: function }` | 派生计算，`this` 指向 store |
| `actions` | `{ [key]: function }` | 业务方法，`this` 指向 store |
| `watch` | `{ [path]: handler \| options }` | 声明式 watcher，支持 dot-path |
| `lifecycle` | `{ mount, unmount, activate, deactivate }` | 页面生命周期钩子 |

### Store 实例属性与方法

| 属性/方法 | 说明 |
|---|---|
| `store.xxx` | 直接访问 state 字段 |
| `store.$state` | 原始响应式 state 对象 |
| `store.$status` | `{ mounted, active }` 响应式状态 |
| `store.$disposed` | store 是否已销毁 |
| `store.$id` | store 唯一标识 |
| `store.$patch(partial \| fn)` | 批量更新 state（浅合并） |
| `store.$reset()` | 重置到 `state()` 初始值，清除动态字段 |
| `store.$emit(event, payload)` | 发射事件（当前 store 作用域） |
| `store.$on(event, handler)` | 订阅事件，返回取消函数 |
| `store.$off(event, handler?)` | 取消订阅 |
| `store.bindTo(componentVm)` | 绑定组件生命周期 + 自动 provide，子组件 `inject: ['pageStore']` |
| `store.$destroy()` | 手动销毁 |

### watch 配置

```js
watch: {
  // 函数写法 — 默认 shallow watch
  'fieldName'(newVal, oldVal) { ... },

  // 对象写法 — 可配置 deep / immediate
  'filters': {
    handler(newVal, oldVal) { ... },
    deep: true,        // 默认 false
    immediate: true    // 默认 false
  }
}
```

## State Shape 规则

`state()` 返回值定义了推荐的状态边界：

- **推荐**：在 `state()` 中声明完整字段，即使初始值为 `null` 或空数组
- **允许**：通过 `$patch` 动态新增字段（会写入 `$state`，但不会自动成为 `store.xxx` 顶层代理）
- **注意**：`$reset()` 会清除所有不在 `state()` 中的动态字段

```js
state: () => ({
  filters: {},
  list: [],
  detail: null  // 推荐：先声明为 null，而不是运行时再 $patch 进去
})
```

## 实例模型：Singleton

当前版本采用 **id → singleton** 模型：

- 同一个 `id` 在整个应用中对应唯一一个 store 实例
- `useStore()` 多次调用返回同一实例
- `$destroy()` 后从 registry 移除，下次 `useStore()` 会创建新实例

**适用场景：**

- 单页面单作用域（最常见）
- keep-alive 下的页面缓存

**不适用场景：**

- 同一路由多开独立副本
- 需要按参数区分的多实例页面

> 多实例支持（keyed instance / scopeKey）将在未来版本演进。

## 适用场景

- 仪表盘页面 — 多模块共享筛选条件、加载状态
- 漏斗/留存等分析详情页 — 复杂交互 + 异步数据 + 生命周期管理
- 大型配置页 — 多 tab/多步骤表单的状态统一管理
- keep-alive 业务页 — 需要 activate/deactivate 感知的页面
- 微前端子应用 — 页面作用域隔离，不污染宿主全局状态

## 不适用场景

- 全局用户信息、权限、路由等 → 用 Vuex
- 简单页面的小 data 管理 → 用组件 data 就够了
- 需要同 id 多实例并存 → 当前版本不支持

## 异步安全

页面销毁后，异步请求可能仍在 pending。**不需要手动检查** —— store 在销毁后会自动忽略所有写操作：

```js
actions: {
  async fetchData() {
    this.loading = true
    const data = await api.getData()
    // 即使页面已销毁，下面的赋值也会被自动静默，不会报错
    this.list = data
    this.loading = false
  }
}
```

底层原理：`$destroy()` 后，state 的 setter 和 `$patch` 都会检查 `$disposed`，写入直接跳过。开发环境下会打印 warning 帮助调试。

## 调试

`storeRegistry` 是导出的 Map，可以在控制台直接查看：

```js
import { storeRegistry } from 'vue-page-store'

// 查看所有活跃 store
storeRegistry.forEach((store, id) => {
  console.log(id, store.$status, store.$disposed)
})
```

## 从 v0.2.x 升级

### Breaking Changes

**1. `$reset()` 语义变严格**

v0.2.x：只恢复已有字段的值，动态新增字段会残留。

v0.3.0：完全恢复到 `state()` 的 shape，动态字段会被移除。

**2. `watch` 默认不再 deep**

v0.2.x：所有 watcher 默认 `deep: true`。

v0.3.0：默认 `deep: false`。如果你的 watcher 依赖深层变化检测，需要显式加 `deep: true`。

```js
// v0.2.x — 这个能监听到 filters 内部变化
watch: {
  'filters'(val) { this.fetchData() }
}

// v0.3.0 — 需要显式声明 deep
watch: {
  'filters': {
    handler(val) { this.fetchData() },
    deep: true
  }
}
```

**3. `_disposed` → `$disposed`**

`_disposed` 改为公开属性 `$disposed`，语义不变。如果你之前用了 `store._disposed`，替换为 `store.$disposed`。

### New Features

- `bindTo()` 自动 provide — 子组件 `inject: ['pageStore']` 即可获取，不需要 import store 文件
- `bindTo()` 重复绑定防护 — 同一个组件实例多次调用不会重复注册生命周期
- 开发环境 warning — watch 缺少 handler、definePageStore 参数错误等场景会有提示

## Roadmap

- **Plugin system** — 可扩展能力（logger、persist、loading tracker）
- **Keyed instance** — `useStore(vm, scopeKey)` 支持同定义多实例
- **Page cache strategy** — TTL、revalidate、stale-while-activate

## License

MIT © weijianjun