# vue-page-store

> Vue 2.6 页面级作用域运行时容器 —— source、state、getters、actions、watch、init/enter/leave，一个页面作用域全收。

## 它是什么

`vue-page-store` 是面向 **复杂 Vue 2 业务页面** 的页面级运行时容器。

一个 `definePageStore` 定义一个 **Page Scope** —— 它统一管理这个页面作用域内的：

- **source** — 页面输入 / 原始返回（如路由参数、接口响应）
- **state** — 响应式业务状态
- **getters** — 派生计算
- **actions** — 业务逻辑
- **watch** — 声明式副作用
- **init** — 一次性初始化（拉字典、注册事件监听等）
- **enter / leave** — 页面可见性生命周期
- **$setInterval** — 页面级定时器托管
- **event bus** — 页面内作用域通信
- **plugin** — 外部扩展机制（v0.5 新增）

页面离开时可以自动清理页面级定时器，页面销毁时 `$destroy` 一键回收，不污染全局。

## 它不是什么

- **不是 Vuex / Pinia 替代品** — 全局状态（用户信息、权限、路由）请继续用 Vuex / Pinia
- **不是全局状态管理方案** — 它的作用域是"页面"，不是"应用"
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

  // 只执行一次：拉下拉框选项、注册事件监听等
  init() {
    this.loadDictOptions()
    this.$on('child:refresh', () => this.search())
  },

  // 每次页面可见时执行
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
    // 传入 this → 自动绑定 init/enter/leave + 自动 provide + 页面销毁时自动回收
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
| `init` | `function` | store 创建后一次性调用，`$vm` 已可用。适合拉字典、注册事件监听 |
| `enter` | `function` | 页面进入可见 / 可交互状态时触发 |
| `leave` | `function` | 页面离开可见 / 可交互状态时触发 |
| *其它字段* | *any* | 注册过的 plugin 可声明自己的字段（见 [Plugin](#plugin)） |

### `registerPlugin(plugin)` *(v0.5 新增)*

注册全局插件，详见 [Plugin](#plugin) 节。

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

v0.4 引入了 `source`，用于把"页面输入 / 原始返回"和"业务状态"分开。

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

## init / enter / leave

v0.4 用 `enter / leave` 替换了 v0.3 的 `lifecycle.mount / unmount / activate / deactivate`。

v0.4.1 新增 `init`，用于 store 创建后的一次性初始化。

### 语义

- **init**：store 创建后一次性调用，`$vm` 已可用，DOM 未就绪
- **enter**：页面进入可见 / 可交互状态
- **leave**：页面离开可见 / 可交互状态

### 执行时序

```
created() 开始
  └→ useStore(this)
       └→ createStoreInstance()   ← state/source/getters/actions 就绪
       └→ plugin.install()        ← v0.5：plugin 安装（$vm 尚未绑定）
       └→ bindTo(this)            ← $vm 赋值
       └→ ★ init()               ← $vm 可用，只执行一次
  └→ created() 剩余代码
mounted()
  └→ ★ enter()                   ← DOM 就绪，每次可见都执行
  └→ plugin.enter()              ← v0.5：plugin enter 钩子

--- keep-alive 切走 ---
deactivated()
  └→ clearAllIntervals()
  └→ ★ leave()
  └→ plugin.leave()              ← v0.5：plugin leave 钩子

--- keep-alive 切回 ---
activated()
  └→ ★ enter()                   ← 重新开轮询、刷数据
  └→ plugin.enter()

--- 页面销毁 ---
beforeDestroy()
  └→ ★ leave()（如果还没 leave）
  └→ plugin.destroy()            ← v0.5：plugin destroy 钩子
  └→ $destroy()
```

### 分工原则

| 钩子 | 执行次数 | $vm | DOM | 典型场景 |
|---|---|---|---|---|
| `init` | 一次 | ✅ | ❌ | 拉下拉框选项、注册事件监听、从 localStorage 恢复配置、初始化 WebSocket |
| `enter` | 每次可见 | ✅ | ✅ | 读路由参数、刷列表数据、开轮询 |
| `leave` | 每次离开 | ✅ | ✅ | 通常不需要写，interval 已自动清理 |

### keep-alive 行为

- 首次 `mounted` → `enter`
- `activated` → `enter`
- `deactivated` → `leave`
- `beforeDestroy` → 如果当前还没 leave，先 leave，再 `$destroy`

### 适合放在 init 里的逻辑

- 拉下拉框 / 字典选项（只需要一次）
- 注册 `$on` 监听 store 内部事件
- 从 localStorage 恢复上次的筛选条件
- 初始化 WebSocket / EventSource 连接
- 根据用户权限裁剪 columns / 按钮配置

### 适合放在 enter 里的逻辑

- 根据 `$route` 初始化 source / state（keep-alive 切回时路由参数可能变了）
- 首屏加载 / 刷新列表数据
- 启动页面轮询

```js
init() {
  this.loadDictOptions()
  this.$on('child:refresh', () => this.search())
},

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

## Plugin

*v0.5 新增。* Plugin 机制让外部库可以给 `definePageStore` options 增加**新字段**并消费它，同时挂钩 enter / leave / destroy 生命周期——而不需要修改 page-store 本身。

> 典型场景：`vue-page-runtime`（请求编排）、`vue-page-persist`（状态持久化）、devtools 扩展。

### 协议

Plugin 是一个对象，包含 `name` 和 `install`：

```js
{
  name: 'tasks',                          // 同时作为 options 字段匹配键
  install(store, fieldValue, { Vue }) {   // fieldValue === options.tasks
    // 初始化 plugin 自己的逻辑
    return {
      enter()   { /* page enter 后调用 */ },
      leave()   { /* page leave 后调用 */ },
      destroy() { /* store 销毁时调用 */ },
    }
  }
}
```

- **匹配规则**：`options[plugin.name] !== undefined` 才会调用 `install`。没有声明字段的 store 完全不受影响。
- **install 时机**：store 创建末尾，state / getters / actions / $source / $setInterval / $emit 等全部就绪。`$vm` 此时**尚未**绑定。
- **返回值**：可选 `{ enter?, leave?, destroy? }`。不需要钩子可以不返回。

### 注册

全局注册一次即可：

```js
// main.js
import { registerPlugin } from 'vue-page-store'
import taskPlugin from 'vue-page-runtime/plugin'

registerPlugin(taskPlugin)
```

之后正常写 store，声明插件字段：

```js
import { definePageStore } from 'vue-page-store'   // 入口不变

definePageStore('order', {
  state: () => ({ /* ... */ }),

  // page-store 不认识这个字段，但会递给注册过的 plugin
  tasks: {
    fetchUser: {
      trigger: 'enter',
      async run() { return api.getUser(this.$vm.$route.params.id) },
    },
    fetchOrders: {
      deps: ['fetchUser'],
      async run() { /* ... */ },
    },
  },
})
```

### 写一个 plugin

最小示例——一个把 `persist` 字段声明持久化到 localStorage 的插件：

```js
const persistPlugin = {
  name: 'persist',

  install(store, fieldValue /* options.persist */, { Vue }) {
    const { key, paths } = fieldValue

    // 恢复
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}')
      store.$patch(saved)
    } catch (e) {}

    // 持久化 —— 监听指定字段
    const stopWatchers = paths.map(p =>
      store._vm.$watch(
        () => store[p],
        (val) => {
          const cur = JSON.parse(localStorage.getItem(key) || '{}')
          cur[p] = val
          localStorage.setItem(key, JSON.stringify(cur))
        }
      )
    )

    return {
      destroy() {
        stopWatchers.forEach(stop => stop())
      }
    }
  }
}

registerPlugin(persistPlugin)
```

使用：

```js
definePageStore('page', {
  state: () => ({ keyword: '', filters: {} }),
  persist: {
    key: 'page:cache',
    paths: ['keyword', 'filters']
  }
})
```

### 注意事项

- **全局注册，影响所有 store**。plugin 只在对应 store 声明了 `options[plugin.name]` 时才激活，但注册本身是全局的。
- **同名 plugin 只能注册一次**，重复注册会被跳过并打印 warning。
- **install 返回的钩子会被按注册顺序依次调用**（FIFO）。
- **plugin 之间不通信**。如果两个 plugin 有依赖关系，应该合并成一个。
- **$vm 在 install 时为 null**。如果 plugin 需要组件实例，应在 `enter` 钩子里访问（此时 `$vm` 已绑定）。

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
- keep-alive 业务页 —— 需要 init / enter / leave 感知的页面
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

### `storeRegistry` —— 导出的 Map

`storeRegistry` 是导出的 Map，可以在代码里用于调试或自定义 devtools 集成：

```js
import { storeRegistry } from 'vue-page-store'

storeRegistry.forEach((store, id) => {
  console.log(id, store.$status, store.$disposed)
})
```

### `window.__VUE_PAGE_STORE__` —— dev 自动挂载 *(v0.5 新增)*

开发环境下（`process.env.NODE_ENV !== 'production'`）会自动挂到 `window.__VUE_PAGE_STORE__`，方便控制台访问。生产环境和 SSR 环境不会挂。

控制台用法：

```js
__VUE_PAGE_STORE__                        // { registry, stores }
__VUE_PAGE_STORE__.stores                 // { orderList: {…}, userProfile: {…} }
__VUE_PAGE_STORE__.stores.orderList       // ← 有属性自动补全
__VUE_PAGE_STORE__.stores.orderList.$source
__VUE_PAGE_STORE__.stores.orderList.$loading

// 原始 Map 也保留
__VUE_PAGE_STORE__.registry.forEach(...)
```

- `registry`：导出的原始 Map，和 `import { storeRegistry }` 拿到的是同一个引用
- `stores`：getter，每次读取重建对象视图；销毁的 store 自动消失

**说明**：

- `__VUE_PAGE_STORE__` 是 dev-only 调试接口，shape 和键名可能在后续版本变化，**不要在生产代码里依赖**
- 微前端场景下，多个子应用都加载 vue-page-store 时，最后挂载的会覆盖前面的。如需共存，请退回手动挂载并用自己的命名

### `window.PAGE_STORE_DEVTOOLS` —— debug 注册表 *(v0.5.1 新增)*

v0.5.1 新增了 dev-only 的 debug 模块，在 `window.PAGE_STORE_DEVTOOLS` 上暴露结构化调试数据：

```js
window.PAGE_STORE_DEVTOOLS
// {
//   stores: Map,     ← store 元信息（id、active、destroyed、storeRef…）
//   events: [],      ← 事件时间线（最近 500 条）
//   seq: number      ← 全局递增计数
// }
```

#### 自动采集的事件

| 事件 | 说明 |
|---|---|
| `store:create` | store 实例创建 |
| `store:destroy` | store 实例销毁 |
| `action:start` | action 调用开始（含参数快照） |
| `action:end` | action 调用结束（含 duration） |
| `action:error` | action 抛错或 reject（含错误信息和 duration） |

每条事件包含 `seq`（全局序号）、`ts`（时间戳）、`storeId`、`type`、`payload`。

#### 控制台用法

```js
// 查看当前存活的 store
PAGE_STORE_DEVTOOLS.stores

// 查看最近的事件
PAGE_STORE_DEVTOOLS.events.slice(-5)

// 筛选某个 store 的 action 事件
PAGE_STORE_DEVTOOLS.events
  .filter(e => e.storeId === 'orderList' && e.type.startsWith('action:'))

// 查看 action 耗时
PAGE_STORE_DEVTOOLS.events
  .filter(e => e.type === 'action:end')
  .map(e => e.payload.action + ': ' + e.payload.duration + 'ms')
```

生产环境下 `PAGE_STORE_DEVTOOLS` 不会被挂载，所有 debug 逻辑为 no-op。

### DevPanel —— 页面内悬浮面板 *(v0.5.1 新增)*

v0.5.1 提供了一个最小的页面内调试面板，在右下角悬浮显示：

- **左侧**：store 列表（显示 active / idle / destroyed 状态）
- **右侧四个 tab**：
  - `$state` — 当前选中 store 的业务状态
  - `$source` — 页面输入 / 原始返回
  - `getters` — 派生计算值
  - `events` — 该 store 最近 50 条事件

面板每 500ms 刷新一次，实时反映 store 变化。

#### 接入方式

```js
// main.js — 仅开发环境加载
if (process.env.NODE_ENV !== 'production') {
  import('vue-page-store/debug/installPanel').then(m => m.installDevPanel())
}
```

面板会自动挂载到 `document.body`，不侵入业务组件树。生产环境下 `installDevPanel()` 是 no-op。

#### 注意事项

- DevPanel 是独立 Vue 实例，不影响业务组件树
- 需要构建链能处理 `.vue` SFC（webpack + vue-loader 或 Vite 默认支持）
- 微前端场景下，多个子应用各自挂面板，互不干扰
- 这是 dev-only 工具，不要在生产代码里依赖

#### 强制开启

Vite / webpack 5 等不 polyfill `process` 的环境下，如果 `isDev` 检测失败，可以在**页面加载前**手动设置：

```js
window.__VUE_PAGE_STORE_DEV__ = true
```

### debug 模块文件结构

```
src/debug/
  ├── registry.js      ← window.PAGE_STORE_DEVTOOLS 数据层
  ├── emit.js          ← emitDebugEvent 埋点入口
  ├── DevPanel.vue     ← 悬浮面板组件
  └── installPanel.js  ← 面板挂载器
```

所有 debug 文件仅在 dev 环境生效。生产构建中：`registry.js` 和 `emit.js` 中的所有函数早 return / 返回空值，不执行任何逻辑，不挂 `window`，不占内存。如果你的打包器支持 tree-shaking 且 `import('...installPanel')` 走动态导入，面板代码不会进入生产包。

## 从 v0.3.x 升级

### Breaking Changes

**1. `lifecycle` 被移除，改为 `init` / `enter` / `leave`**

v0.3.x：

```js
lifecycle: {
  mount() {},
  unmount() {},
  activate() {},
  deactivate() {}
}
```

v0.4.x：

```js
init() {
  // 只执行一次的初始化（拉字典、注册事件等）
},
enter() {
  // 每次可见时执行（替代 mount + activate）
},
leave() {
  // 每次离开时执行（替代 deactivate + unmount）
}
```

迁移关系：

- `lifecycle.mount` → `enter`（如果包含一次性逻辑，拆到 `init`）
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
- `init`：store 创建后一次性钩子，`$vm` 已可用（v0.4.1）
- `enter / leave`：更简单的页面可见性生命周期
- `$setInterval()`：页面级 interval 托管
- `$loading.xxx`：返回 Promise 的 action 自动追踪 loading
- `$vm`：只读逃生口，可在 init / enter 中访问 `$route / $router`
- `registerPlugin()`：外部扩展机制（v0.5）

## 从 v0.4.x 升级到 v0.5

v0.5 **完全向后兼容** v0.4.x：

- 所有 v0.4 的 API 行为不变
- 新增 `registerPlugin()` 导出，不注册 plugin 等同于 v0.4 行为
- options 现在允许包含插件声明的额外字段（如 `tasks`、`persist`）
- dev 环境自动挂 `window.__VUE_PAGE_STORE__`，方便控制台调试

升级只需要改版本号，无需改代码。

## 从 v0.5.0 升级到 v0.5.1

v0.5.1 **完全向后兼容** v0.5.0：

- **修复**：`isDev` 检测改用 `try/catch` 兜底，修复 Vite / webpack 5 不 polyfill `process` 时模块加载报错的问题
- **新增**：dev-only debug 模块（`debug/registry.js`、`debug/emit.js`、`debug/DevPanel.vue`、`debug/installPanel.js`）
- **新增**：`window.PAGE_STORE_DEVTOOLS` 调试注册表，自动采集 store 创建/销毁和 action 调用事件
- **新增**：DevPanel 悬浮面板，可视化查看 store 列表、state/source/getters、事件时间线

升级只需要改版本号。debug 模块为可选接入，不接入等同于 v0.5.0 行为。

## Roadmap

- **Keyed instance** — `useStore(vm, scopeKey)` 支持同定义多实例
- **Official plugins** — 随着 `vue-page-runtime` 等生态库成熟，补充第一方 plugin 文档
- **More page runtime helpers** — 在不增加心智负担的前提下继续补页面层能力
- **Vue Devtools 集成** — 在 debug 模块基础上对接 Vue Devtools inspector / timeline API

## License

MIT © weijianjun