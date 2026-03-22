/**
 * vue-page-store v0.3.0 - TypeScript 类型定义
 *
 * Page Scope Runtime for Vue 2.6
 */

/** Vue 2 组件实例的最小接口（避免强依赖 vue 类型包） */
export interface Vue2ComponentInstance {
  $on(event: string, handler: Function): void;
}

/** lifecycle 钩子配置 */
export interface StoreLifecycle<S extends Record<string, any>> {
  /** 组件 mounted 时触发 */
  mount?: (this: PageStore<S>) => void;
  /** 组件 beforeDestroy 时触发（keep-alive 同） */
  unmount?: (this: PageStore<S>) => void;
  /** keep-alive activated 时触发 */
  activate?: (this: PageStore<S>) => void;
  /** keep-alive deactivated 时触发 */
  deactivate?: (this: PageStore<S>) => void;
}

/** getter/action 的 this 上下文用类型别名表达 */
type GetterFn<S extends Record<string, any>> =
  (this: PageStore<S>) => any;

type ActionFn<S extends Record<string, any>> =
  (this: PageStore<S>, ...args: any[]) => any;

type WatchHandler<S extends Record<string, any>> =
  (this: PageStore<S>, newVal: any, oldVal: any) => void;

export interface StoreOptions<S extends Record<string, any>> {
  state: () => S;
  getters?:  { [key: string]: GetterFn<S> };
  actions?:  { [key: string]: ActionFn<S> };
  watch?: {
    [key: string]:
      | WatchHandler<S>
      | {
          handler: WatchHandler<S>;
          /** 默认 false（v0.3 breaking change） */
          deep?: boolean;
          /** 默认 false */
          immediate?: boolean;
        };
  };
  lifecycle?: StoreLifecycle<S>;
}

/** store 运行状态 */
export interface StoreStatus {
  /** 组件是否已 mounted */
  mounted: boolean;
  /** 组件当前是否处于活跃状态（keep-alive 场景下会变化） */
  active: boolean;
}

export interface Store<S extends Record<string, any>> {
  /** Store 唯一标识 */
  readonly $id: string;
  /** 原始响应式 state 对象 */
  readonly $state: S;
  /** 挂载 / 活跃状态（响应式） */
  readonly $status: StoreStatus;
  /** store 是否已销毁（v0.3 公开属性，替代原 _disposed） */
  readonly $disposed: boolean;

  /** 批量更新 state（浅合并） */
  $patch(partial: Partial<S>): void;
  $patch(fn: (state: S) => Partial<S>): void;

  /**
   * 重置 state 到初始值
   *
   * v0.3 语义：完全恢复到 state() 的 shape
   *   - 初始字段恢复为新鲜值
   *   - 运行时动态新增的字段被移除
   */
  $reset(): void;

  /** 发射事件（仅当前 store 作用域） */
  $emit(event: string, payload?: any): void;

  /** 订阅事件，返回取消函数 */
  $on(event: string, handler: (payload?: any) => void): () => void;

  /** 取消订阅事件（不传 handler 则清除该事件所有订阅） */
  $off(event: string, handler?: (payload?: any) => void): void;

  /**
   * 绑定组件实例，自动挂载生命周期 + 自动 provide('pageStore', store)
   *
   * v0.3: 同一个 vm 重复绑定会被安全跳过
   * 子组件 inject: ['pageStore'] 即可获取
   *
   * 必须在组件 created 中调用
   * @returns store 自身，支持链式调用
   */
  bindTo(componentVm: Vue2ComponentInstance): this;

  /** 销毁 store，释放所有资源 */
  $destroy(): void;
}

/** Store 实例类型 = state 属性 + getters + actions + 内置方法 */
export type PageStore<S extends Record<string, any>> = Store<S> & S;

/**
 * 定义页面级 Store
 *
 * 当前版本采用 id → singleton 实例模型：
 *   同一个 id 在整个应用生命周期内对应唯一一个 store 实例。
 *
 * @param id - 唯一标识
 * @param options - store 配置
 * @returns useStore(vm?) - 调用即获取 / 创建 store 实例；
 *          传入组件实例时自动绑定生命周期（须在 created 中调用）
 */
export declare function definePageStore<S extends Record<string, any>>(
  id: string,
  options: StoreOptions<S>
): (componentVm?: Vue2ComponentInstance) => PageStore<S>;

/** Store 注册表（供调试 / devtools 使用） */
export declare const storeRegistry: Map<string, PageStore<any>>;