/**
 * vue-page-store v0.5.1 - TypeScript 类型定义
 *
 * Page Scope Runtime for Vue 2.6
 */

/** Vue 2 组件实例的最小接口 */
export interface Vue2ComponentInstance {
  $on(event: string, handler: Function): void;
  [key: string]: any;
}

/** store 运行状态 */
export interface StoreStatus {
  mounted: boolean;
  active: boolean;
}

/** getter/action 的 this 上下文用类型别名表达 */
type GetterFn<S extends Record<string, any>, Src extends Record<string, any>> =
  (this: PageStore<S, Src>) => any;

type ActionFn<S extends Record<string, any>, Src extends Record<string, any>> =
  (this: PageStore<S, Src>, ...args: any[]) => any;

type WatchHandler<S extends Record<string, any>, Src extends Record<string, any>> =
  (this: PageStore<S, Src>, newVal: any, oldVal: any) => void;

export interface StoreOptions<
  S extends Record<string, any>,
  Src extends Record<string, any> = {}
> {
  /** 页面输入源（v0.4 新增） */
  source?: () => Src;

  /** 页面业务状态 */
  state: () => S;

  getters?: { [key: string]: GetterFn<S, Src> };
  actions?: { [key: string]: ActionFn<S, Src> };

  watch?: {
    [key: string]:
      | WatchHandler<S, Src>
      | {
          handler: WatchHandler<S, Src>;
          deep?: boolean;
          immediate?: boolean;
        };
  };

  /**
   * store 创建后一次性调用（v0.4.1 新增）
   * bindTo 之后调用，$vm 已可用
   * 适合拉字典、注册事件监听、从 localStorage 恢复配置、初始化 WebSocket
   */
  init?: (this: PageStore<S, Src>) => void;

  /**
   * 页面进入可见/可交互状态（v0.4 新增，替换 v0.3 lifecycle）
   * keep-alive 切回时也会触发
   */
  enter?: (this: PageStore<S, Src>) => void;

  /**
   * 页面离开可见/可交互状态（v0.4 新增，替换 v0.3 lifecycle）
   * keep-alive 切走时也会触发
   * interval 在 leave 前已自动清理
   */
  leave?: (this: PageStore<S, Src>) => void;

  /** 允许 plugin 声明的额外字段（v0.5 新增） */
  [key: string]: any;
}

export interface Store<
  S extends Record<string, any>,
  Src extends Record<string, any> = {}
> {
  readonly $id: string;
  readonly $state: S;
  readonly $disposed: boolean;
  readonly $status: StoreStatus;

  /** 页面输入源（v0.4 新增） */
  readonly $source: Src;

  /**
   * async action 自动追踪的 loading 状态（v0.4 新增）
   * key 按 actions 对象属性名索引
   */
  readonly $loading: Record<string, boolean | undefined>;

  /**
   * 绑定的组件实例引用（v0.4 新增）
   * 逃生口，用于访问 $route / $router 等组件上下文
   */
  readonly $vm: Vue2ComponentInstance | null;

  $patch(partial: Partial<S>): void;
  $patch(fn: (state: S) => Partial<S>): void;

  /**
   * 重置 state 和 source 到初始值
   * v0.4：同时重置 source，删除动态字段
   */
  $reset(): void;

  $emit(event: string, payload?: any): void;
  $on(event: string, handler: (payload?: any) => void): () => void;
  $off(event: string, handler?: (payload?: any) => void): void;

  /**
   * 注册页面级 interval（v0.4 新增）
   * leave 时自动清理，$destroy 时兜底清理
   * @returns stop 函数，可手动停止
   */
  $setInterval(fn: () => void, delay: number): () => void;

  /**
   * 绑定组件实例
   * v0.4：挂载 $vm + enter/leave 替代 lifecycle
   */
  bindTo(componentVm: Vue2ComponentInstance): this;

  $destroy(): void;
}

/** Store 实例类型 = state 属性 + getters + actions + 内置方法 */
export type PageStore<
  S extends Record<string, any>,
  Src extends Record<string, any> = {}
> = Store<S, Src> & S;

/**
 * 定义页面级 Store
 *
 * v0.4 变更：
 *   - options 新增 source、enter、leave
 *   - options 移除 lifecycle（breaking change）
 *   - async action 自动追踪 $loading
 * v0.4.1 变更：
 *   - options 新增 init（bindTo 之后一次性调用）
 * v0.5 变更：
 *   - options 支持 plugin 声明的自定义字段
 */
export declare function definePageStore<
  S extends Record<string, any>,
  Src extends Record<string, any> = {}
>(
  id: string,
  options: StoreOptions<S, Src>
): (componentVm?: Vue2ComponentInstance) => PageStore<S, Src>;

/** Store 注册表 */
export declare const storeRegistry: Map<string, PageStore<any, any>>;

// ====== v0.5 新增：plugin 类型 ======

/**
 * Plugin install 返回的生命周期钩子（v0.5 新增）
 * page-store 会在对应时机调用
 */
export interface PluginHooks {
  /** 每次 page enter 之后调用（用户 enter hook + page:enter event 之后） */
  enter?: () => void;
  /** 每次 page leave 之后调用（用户 leave hook + page:leave event 之后） */
  leave?: () => void;
  /** store $destroy 时调用，用于释放 plugin 自己的资源 */
  destroy?: () => void;
}

/**
 * Plugin 定义（v0.5 新增）
 *
 * plugin.name 同时作为字段名：
 *   当 definePageStore options 中存在 options[name] 时，
 *   page-store 会调用 install(store, fieldValue, { Vue })
 *
 * install 在 store 创建末尾、bindTo 之前执行，此时 state/getters/actions/$source/$setInterval 已就绪
 */
export interface PageStorePlugin {
  name: string;
  install(
    store: PageStore<any, any>,
    fieldValue: any,
    context: { Vue: any }
  ): PluginHooks | void;
}

/**
 * 注册全局 plugin（v0.5 新增）
 *
 * 同名 plugin 重复注册会被跳过并打印 warning
 */
export declare function registerPlugin(plugin: PageStorePlugin): void;

// ====== v0.5.1 新增：debug 模块类型 ======

/** debug 事件记录 */
export interface DebugEvent {
  seq: number;
  ts: number;
  storeId: string;
  type:
    | 'store:create'
    | 'store:destroy'
    | 'lifecycle:init'
    | 'lifecycle:enter'
    | 'lifecycle:leave'
    | 'action:start'
    | 'action:end'
    | 'action:error'
    | 'state:set'
    | 'state:patch';
  payload?: any;
}

/** debug 注册表中的 store 元信息 */
export interface DebugStoreMeta {
  id: string;
  name: string;
  route: { path: string; fullPath: string; name?: string } | null;
  createdAt: number;
  active: boolean;
  destroyed: boolean;
  keepAlive: boolean;
  storeRef: PageStore<any, any>;
}

/** window.PAGE_STORE_DEVTOOLS 的类型 */
export interface PageStoreDevtools {
  stores: Map<string, DebugStoreMeta>;
  events: DebugEvent[];
  seq: number;
}

/**
 * 挂载 DevPanel 悬浮面板到 document.body（v0.5.1 新增）
 *
 * 仅 dev 环境生效，生产环境 no-op
 * 幂等，多次调用只挂一次
 *
 * @example
 * ```js
 * // main.js
 * if (process.env.NODE_ENV !== 'production') {
 *   import('vue-page-store/debug/installPanel').then(m => m.installDevPanel())
 * }
 * ```
 */
export declare function installDevPanel(): void;