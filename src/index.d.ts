/**
 * vue-page-store v0.4.1 - TypeScript 类型定义
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