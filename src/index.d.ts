/**
 * vue-page-store - TypeScript 类型定义
 */

export interface StoreOptions<S extends Record<string, any>> {
  /** 返回初始 state 的工厂函数 */
  state: () => S;
  /** 计算属性（getter 内部 this 指向 store） */
  getters?: Record<string, (this: Store<S>) => any>;
  /** 操作方法（action 内部 this 指向 store） */
  actions?: Record<string, (this: Store<S>, ...args: any[]) => any>;
  /** 声明式侦听器（支持点路径 'a.b.c' 或对象配置） */
  watch?: Record<
    string,
    | ((this: Store<S>, newVal: any, oldVal: any) => void)
    | {
        handler: (this: Store<S>, newVal: any, oldVal: any) => void;
        immediate?: boolean;
      }
  >;
}

export interface Store<S extends Record<string, any>> {
  /** Store 唯一标识 */
  readonly $id: string;
  /** 原始响应式 state 对象 */
  readonly $state: S;

  /** 批量更新 state（浅合并） */
  $patch(partial: Partial<S>): void;
  $patch(fn: (state: S) => Partial<S>): void;

  /** 订阅 state 变化 */
  $subscribe(callback: (newState: S) => void): () => void;

  /** 重置 state 到初始值 */
  $reset(): void;

  /** 发射事件（仅当前 store 作用域） */
  $emit(event: string, payload?: any): void;

  /** 订阅事件，返回取消函数 */
  $on(event: string, handler: (payload?: any) => void): () => void;

  /** 取消订阅事件 */
  $off(event: string, handler?: (payload?: any) => void): void;

  /** 销毁 store，释放所有资源 */
  $destroy(): void;
}

/** Store 实例类型 = state 属性 + getters + actions + 内置方法 */
export type PageStore<S extends Record<string, any>> = Store<S> & S;

/**
 * 定义页面级 Store
 *
 * @param id - 唯一标识
 * @param options - store 配置
 * @returns useStore 函数，调用即获取 / 创建 store 实例
 */
export declare function definePageStore<S extends Record<string, any>>(
  id: string,
  options: StoreOptions<S>
): () => PageStore<S>;

/**
 * 将 store 的 state 属性转为 refs 对象
 */
export declare function storeToRefs<S extends Record<string, any>>(
  store: PageStore<S>
): { [K in keyof S]: S[K] };

/** Store 注册表 */
export declare const storeRegistry: Map<string, PageStore<any>>;
