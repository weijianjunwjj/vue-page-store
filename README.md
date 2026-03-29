# vue-page-store

> Vue 2.6 页面级作用域运行时容器 —— source、state、getters、actions、watch、enter/leave，一个页面作用域全收。

## 它是什么

`vue-page-store` 是面向 **复杂 Vue 2 业务页面** 的页面级运行时容器。

一个 `definePageStore` 定义一个 **Page Scope** —— 它统一管理这个页面作用域内的：

- **source** — 页面输入 / 原始返回（如路由参数、接口响应）
- **state** — 响应式业务状态
- **getters** — 派生计算
- **actions** — 业务逻辑
- **watch** — 声明式副作用
- **enter / leave** — 页面可见性生命周期
- **$setInterval** — 页面级定时器托管
- **event bus** — 页面内作用域通信

页面离开时可以自动清理页面级定时器，页面销毁时 `$destroy` 一键回收，不污染全局。

## 它不是什么

- **不是 Vuex / Pinia 替代品** — 全局状态（用户信息、权限、路由）请继续用 Vuex / Pinia
- **不是全局状态管理方案** — 它的作用域是“页面”，不是“应用”
- **不是大而全的框架** — 它只解决复杂页面的页面层状态编排

| | Vuex / Pinia | vue-page-store |
|---|---|---|
| 作用域 | 全局 | 页面 |
| 生命周期 | 跟随应用 | 跟随页面可见性 / 页面实例 |
| 适合 | 用户信息、权限、路由状态 | 仪表盘、漏斗详情、大型配置页 |
| 销毁 | 通常不销毁 | 页面离开 / 销毁时可回收 |

## 安装

```bash
npm install vue-page-store
```

要求 `vue@^2.6.0` 作为 peer dependency。

## 快速上手

### 1. 定义 store

```js
// stores/order-list.js
import { definePageStore } from 'vue-page-store'

export const useOrderStore = definePageStore('orderList', {
  source: () => ({
    response: null,
    query: {},
  }),

  state: () => ({
    keyword: '',
    page: 1,
    pageSize: 20,
    selectedIds: [],
    deleteDialogVisible: false,
  }),

  getters: {
    list() {
      return this.$source.response?.list || []
    },
    total() {
      return this.$source.response?.total || 0
    },
    hasSelection() {
      return this.selectedIds.length > 0
    },
    showEmpty() {
      return !this.$loading.search && this.list.length === 0
    }
  },

  actions: {
    async search() {
      const res = await api.getOrders({
        keyword: this.keyword,
        page: this.page,
        pageSize: this.pageSize,
      })
      this.$source.response = res
    },

    async batchDelete() {
      await api.deleteOrders(this.selectedIds)
      this.selectedIds = []
      this.deleteDialogVisible = false
      this.search()
    },

    openDeleteDialog() {
      this.deleteDialogVisible = true
    },

    closeDeleteDialog() {
      this.deleteDialogVisible = false
    }
  },

  watch: {
    keyword() {
      this.page = 1
    }
  },

  enter() {
    this.$source.query = this.$vm.$route.query
    this.search()
    this.$setInterval(() => this.search(), 5000)
  },

  leave() {
    // interval 会自动清理
  }
})
```

### 2. 页面组件中使用

```js
// OrderListPage.vue
import { useOrderStore } from './stores/order-list'

export default {
  created() {
    // 传入 this → 自动绑定 enter/leave + 自动 provide + 页面销毁时自动回收
    this.pageStore = useOrderStore(this)
  }
}
```

### 3. 子组件中使用

```js
// FilterPanel.vue — 不需要 import store 文件
export default {
  inject: ['pageStore'],
  mounted() {
    this.pageStore.search()
  }
}
```

所有页面统一用 `this.pageStore`，所有子组件统一 `inject: ['pageStore']`。  
不需要知道父页面用的哪个 store 定义，零耦合。

## API

### `definePageStore(id, options)`

定义一个页面级 store，返回 `useStore(componentVm?)` 函数。

**options：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `state` | `() => Object` | **必填**，业务状态工厂函数 |
| `source` | `() => Object` | 页面输入 / 原始返回工厂函数 |
| `getters` | `{ [key]: function }` | 派生计算，`this` 指向 store |
| `actions` | `{ [key]: function }` | 业务方法，`this` 指向 store |
| `watch` | `{ [path]: handler \| options }` | 声明式 watcher，支持 dot-path |
| `enter` | `function` | 页面进入可见 / 可交互状态时触发 |
| `leave` | `function` | 页面离开可见 / 可交互状态时触发 |

### Store 实例属性与方法

| 属性/方法 | 说明 |
|---|---|
| `store.xxx` | 直接访问 state 字段 |
| `store.$state` | 原始响应式 state 对象 |
| `store.$source` | 原始响应式 source 对象 |
| `store.$loading` | action loading 状态对象，如 `store.$loading.search` |
| `store.$status` | `{ mounted, active }` 响应式状态 |
| `store.$disposed` | store 是否已销毁 |
| `store.$id` | store 唯一标识 |
| `store.$vm` | 绑定的页面组件实例（只读逃生口） |
| `store.$patch(partial \| fn)` | 批量更新 state（浅合并） |
| `store.$reset()` | 重置到 `state()` + `source()` 初始值，清除动态字段 |
| `store.$setInterval(fn, delay)` | 注册页面级 interval，leave / destroy 自动清理 |
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

## source 与 state

v0.4 引入了 `source`，用于把“页面输入 / 原始返回”和“业务状态”分开。

### 推荐分工

- **source**：路由参数、接口原始响应、页面输入上下文
- **state**：keyword、分页、选中项、弹窗状态、表单草稿等业务状态

```js
source: () => ({
  response: null,
  query: {},
}),

state: () => ({
  keyword: '',
  page: 1,
  selectedIds: [],
})
```

### 为什么要分开

- 原始返回不再和业务状态混在一起
- getters 可以同时基于 `this.$source` 和 `this.xxx` 计算
- `$reset()` 时 source / state 一起恢复，更清晰

## enter / leave

v0.4 用 `enter / leave` 替换了 v0.3 的 `lifecycle.mount / unmount / activate / deactivate`。

### 语义

- **enter**：页面进入可见 / 可交互状态
- **leave**：页面离开可见 / 可交互状态

### keep-alive 行为

- 首次 `mounted` → `enter`
- `activated` → `enter`
- `deactivated` → `leave`
- `beforeDestroy` → 如果当前还没 leave，先 leave，再 `$destroy`

### 适合放在 enter / leave 里的逻辑

- 首屏加载
- 根据 `$route` 初始化 source / state
- 启动页面轮询
- 页面离开时做收尾逻辑

```js
enter() {
  this.$source.query = this.$vm.$route.query
  this.search()
  this.$setInterval(() => this.search(), 5000)
},

leave() {
  // interval 自动清理
}
```

## `$setInterval`

后台页面经常有轮询 / 倒计时需求，v0.4 提供 `$setInterval(fn, delay)` 统一托管页面级 interval。

### 特性

- 返回 `stop` 函数，可手动停止
- `leave` 时自动清理所有已注册 interval
- `$destroy()` 时兜底清理
- `enter` 时**不会自动恢复**，需要你自己重新注册

```js
enter() {
  this.$setInterval(() => {
    this.search()
  }, 5000)
}
```

## 异步 action 与 `$loading`

v0.4 对返回 Promise 的 action 自动追踪 loading 状态。

你不需要额外包装器，直接写普通 async 函数即可：

```js
actions: {
  async search() {
    const res = await api.getOrders(...)
    this.$source.response = res
  }
}
```

模板中可以直接使用：

```html
<!-- 搜索：只显示 loading -->
<el-button
  :loading="pageStore.$loading.search"
  @click="pageStore.search"
>
  搜索
</el-button>

<!-- 保存：UI 层自己决定是否禁用 -->
<el-button
  :loading="pageStore.$loading.save"
  :disabled="pageStore.$loading.save"
  @click="pageStore.save"
>
  保存
</el-button>
```

### 说明

- 框架只做 **loading 追踪**
- **不自动跳过重复调用**
- 是否防重复，由 UI 层通过 `:disabled="pageStore.$loading.xxx"` 自己决定

## State / Source Shape 规则

### state

`state()` 返回值定义了推荐的业务状态边界：

- **推荐**：在 `state()` 中声明完整字段，即使初始值为 `null` 或空数组
- **允许**：通过 `$patch` 动态新增字段（会写入 `$state`，但不会自动成为 `store.xxx` 顶层代理）
- **注意**：`$reset()` 会清除所有不在 `state()` 中的动态字段

### source

`source()` 返回值定义了页面输入 / 原始返回的初始 shape：

- **推荐**：把常见 source 字段预先声明出来，如 `response`、`query`
- **允许**：运行时动态给 `$source` 增加字段
- **注意**：`$reset()` 同样会清除所有不在 `source()` 中的动态字段

```js
source: () => ({
  response: null,
  query: {},
}),

state: () => ({
  filters: {},
  selectedIds: [],
  detail: null,
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

- 仪表盘页面 —— 多模块共享筛选条件、加载状态
- 漏斗 / 留存等分析详情页 —— 复杂交互 + 异步数据 + 页面可见性管理
- 大型配置页 —— 多 tab / 多步骤表单的状态统一管理
- keep-alive 业务页 —— 需要 enter / leave 感知的页面
- 微前端子应用 —— 页面作用域隔离，不污染宿主全局状态

## 不适用场景

- 全局用户信息、权限、路由等 → 用 Vuex / Pinia
- 简单页面的小 data 管理 → 用组件 data 就够了
- 需要同 id 多实例并存 → 当前版本不支持

## 异步安全

页面销毁后，异步请求可能仍在 pending。**不需要手动检查** —— store 在销毁后会自动忽略所有写操作：

```js
actions: {
  async fetchData() {
    const data = await api.getData()
    // 即使页面已销毁，下面的赋值也会被自动静默，不会报错
    this.$source.response = data
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

## 从 v0.3.x 升级

### Breaking Changes

**1. `lifecycle` 被移除，改为 `enter / leave`**

v0.3.x：

```js
lifecycle: {
  mount() {},
  unmount() {},
  activate() {},
  deactivate() {}
}
```

v0.4.0：

```js
enter() {},
leave() {}
```

迁移关系：

- `lifecycle.mount` → `enter`
- `lifecycle.unmount` → `leave`
- `lifecycle.activate` → `enter`
- `lifecycle.deactivate` → `leave`

**2. `$reset()` 现在同时重置 source 和 state**

v0.4.0 中：

- `state` 恢复到 `state()` 初始值
- `source` 恢复到 `source()` 初始值
- 不在初始 shape 中的动态字段会被移除

### New Features

- `source`：页面输入 / 原始返回与业务状态分离
- `enter / leave`：更简单的页面可见性生命周期
- `$setInterval()`：页面级 interval 托管
- `$loading.xxx`：返回 Promise 的 action 自动追踪 loading
- `$vm`：只读逃生口，可在 enter 中访问 `$route / $router`

## Roadmap

- **Keyed instance** — `useStore(vm, scopeKey)` 支持同定义多实例
- **Page cache strategy** — TTL、revalidate、stale-while-enter
- **More page runtime helpers** — 在不增加心智负担的前提下继续补页面层能力

## License

MIT © weijianjun
