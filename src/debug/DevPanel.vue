<template>
  <div class="ps-devtools" v-if="visible">
    <div class="ps-devtools__header">
      🐛 PageStore Debug
      <button @click="visible = false" style="float:right;background:none;border:none;color:#eee;cursor:pointer">✕</button>
    </div>

    <div class="ps-devtools__body">
      <!-- 左侧：store 列表 -->
      <div class="ps-devtools__sidebar">
        <div
          v-for="item in stores"
          :key="item.id"
          :class="['ps-devtools__store', { active: selectedId === item.id, destroyed: item.destroyed }]"
          @click="selectedId = item.id"
        >
          <div class="name">{{ item.id }}</div>
          <div class="meta">
            {{ item.destroyed ? '🔴 destroyed' : (item.active ? '🟢 active' : '⚪ idle') }}
          </div>
        </div>
        <div v-if="!stores.length" class="meta" style="padding:8px">no stores</div>
      </div>

      <!-- 右侧：详情 -->
      <div class="ps-devtools__main">
        <!-- tab 切换 -->
        <div class="ps-devtools__tabs">
          <span
            v-for="t in tabs" :key="t"
            :class="{ active: tab === t }"
            @click="tab = t"
          >{{ t }}</span>
        </div>

        <div class="ps-devtools__pane" v-if="selectedStore">
          <pre v-if="tab === '$state'">{{ stateText }}</pre>
          <pre v-else-if="tab === '$source'">{{ sourceText }}</pre>
          <pre v-else-if="tab === 'getters'">{{ gettersText }}</pre>
          <div v-else-if="tab === 'events'">
            <div v-if="!filteredEvents.length" class="meta">no events</div>
            <div
              v-for="e in filteredEvents"
              :key="e.seq"
              class="event"
            >
              <span class="seq">#{{ e.seq }}</span>
              <span class="time">{{ formatTime(e.ts) }}</span>
              <span class="type">{{ e.type }}</span>
              <span v-if="e.payload && e.payload.action" class="tag">{{ e.payload.action }}</span>
              <span v-if="e.payload && e.payload.duration !== undefined" class="dim">{{ e.payload.duration }}ms</span>
              <span v-if="e.payload && e.payload.error" class="err">{{ e.payload.error }}</span>
            </div>
          </div>
        </div>
        <div v-else class="meta" style="padding:12px">select a store</div>
      </div>
    </div>
  </div>
  <button v-else class="ps-devtools__pill" @click="visible = true">
    🐛 {{ stores.length }}
  </button>
</template>

<script>
function _dt() {
  return (typeof window !== 'undefined' && window.PAGE_STORE_DEVTOOLS) || null;
}

export default {
  name: 'PageStoreDevPanel',

  data: function () {
    return {
      visible: false,
      selectedId: null,
      tab: '$state',
      tabs: ['$state', '$source', 'getters', 'events'],
      tick: 0,
      _timer: null,
    };
  },

  computed: {
    stores: function () {
      this.tick; // 建立响应式依赖，500ms 驱动刷新
      var dt = _dt();
      if (!dt) return [];
      var list = [];
      dt.stores.forEach(function (m) { list.push(m); });
      return list;
    },

    selectedStore: function () {
      if (!this.selectedId && this.stores.length) {
        this.selectedId = this.stores[0].id;
      }
      for (var i = 0; i < this.stores.length; i++) {
        if (this.stores[i].id === this.selectedId) return this.stores[i];
      }
      return this.stores[0] || null;
    },

    ref: function () {
      return this.selectedStore && this.selectedStore.storeRef;
    },

    stateText: function () {
      this.tick;
      return this.safeJson(this.ref && this.ref.$state);
    },

    sourceText: function () {
      this.tick;
      return this.safeJson(this.ref && this.ref.$source);
    },

    gettersText: function () {
      this.tick;
      var s = this.ref;
      if (!s) return '(no store)';
      var stateKeys = s.$state ? Object.keys(s.$state) : [];
      var sourceKeys = s.$source ? Object.keys(s.$source) : [];
      var out = {};
      for (var k in s) {
        if (!k || k[0] === '$' || k[0] === '_') continue;
        if (stateKeys.indexOf(k) > -1 || sourceKeys.indexOf(k) > -1) continue;
        var v;
        try { v = s[k]; } catch (e) { continue; }
        if (typeof v === 'function') continue;
        out[k] = v;
      }
      var str = this.safeJson(out);
      return str === '{}' ? '(no getters)' : str;
    },

    filteredEvents: function () {
      this.tick;
      if (!this.selectedStore) return [];
      var dt = _dt();
      if (!dt) return [];
      var id = this.selectedStore.id;
      var all = dt.events;
      var filtered = [];
      for (var i = all.length - 1; i >= 0 && filtered.length < 50; i--) {
        if (all[i].storeId === id) filtered.push(all[i]);
      }
      return filtered;
    },
  },

  mounted: function () {
    var self = this;
    this._timer = setInterval(function () { self.tick++; }, 500);
  },

  beforeDestroy: function () {
    if (this._timer) clearInterval(this._timer);
  },

  methods: {
    safeJson: function (val) {
      if (val === undefined || val === null) return String(val);
      try { return JSON.stringify(val, null, 2); }
      catch (e) { return '[Unserializable]'; }
    },

    formatTime: function (ts) {
      if (!ts) return '';
      var d = new Date(ts);
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    },
  },
};
</script>

<style scoped>
.ps-devtools {
  position: fixed;
  bottom: 10px;
  right: 10px;
  width: 540px;
  height: 400px;
  background: #1e1e1e;
  color: #eee;
  font-size: 12px;
  font-family: monospace;
  z-index: 2147483000;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.ps-devtools__header {
  padding: 6px 10px;
  background: #333;
  font-weight: bold;
}
.ps-devtools__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.ps-devtools__sidebar {
  width: 160px;
  flex: 0 0 160px;
  border-right: 1px solid #444;
  overflow-y: auto;
}
.ps-devtools__store {
  padding: 6px 8px;
  cursor: pointer;
  border-bottom: 1px solid #333;
}
.ps-devtools__store:hover { background: #2a2a2a; }
.ps-devtools__store.active { background: #444; }
.ps-devtools__store.destroyed { opacity: 0.45; }
.ps-devtools__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ps-devtools__tabs {
  display: flex;
  border-bottom: 1px solid #444;
  background: #252525;
}
.ps-devtools__tabs span {
  padding: 5px 10px;
  cursor: pointer;
  color: #aaa;
}
.ps-devtools__tabs span:hover { color: #eee; }
.ps-devtools__tabs span.active {
  color: #fff;
  background: #444;
}
.ps-devtools__pane {
  flex: 1;
  overflow: auto;
  padding: 8px;
}
pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  color: #d4d4d4;
}
.meta { font-size: 10px; color: #888; }
.name { color: #eee; }
.event {
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: baseline;
}
.seq { color: #555; min-width: 28px; }
.time { color: #888; min-width: 60px; }
.type { color: #ddd; min-width: 100px; }
.tag { color: #b088f2; }
.dim { color: #666; }
.err { color: #e06464; }
.ps-devtools__pill {
  position: fixed;
  bottom: 10px;
  right: 10px;
  z-index: 2147483000;
  padding: 6px 14px;
  background: #1e1e1e;
  color: #eee;
  border: 1px solid #444;
  border-radius: 20px;
  cursor: pointer;
  font: 12px monospace;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
.ps-devtools__pill:hover { border-color: #888; }
</style>