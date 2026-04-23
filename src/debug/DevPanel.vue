<template>
  <div class="ps-devtools">
    <div class="ps-devtools__header">
      🐛 PageStore Debug
    </div>

    <div class="ps-devtools__body">
      <!-- 左侧：store 列表 -->
      <div class="ps-devtools__sidebar">
        <div
          v-for="item in stores"
          :key="item.id"
          :class="['ps-devtools__store', { active: selectedId === item.id }]"
          @click="selectedId = item.id"
        >
          <div class="name">{{ item.name }}</div>
          <div class="meta">{{ item.id }}</div>
          <div class="meta">
            {{ item.active ? '🟢 active' : '⚪ inactive' }}
          </div>
        </div>
      </div>

      <!-- 右侧：详情 -->
      <div class="ps-devtools__main" v-if="selectedStore">
        <h3>{{ selectedStore.name }}</h3>

        <h4>state</h4>
        <pre>{{ safeJson(selectedStore.storeRef && selectedStore.storeRef.state) }}</pre>

        <h4>source</h4>
        <pre>{{ safeJson(selectedStore.storeRef && selectedStore.storeRef.source) }}</pre>

        <h4>getters</h4>
        <pre>{{ safeJson(readGetters(selectedStore.storeRef)) }}</pre>

        <h4>events（最近 30 条）</h4>
        <div class="event"
             v-for="event in filteredEvents"
             :key="event.seq">
          {{ formatTime(event.ts) }} | {{ event.type }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { getGlobalRegistry } from './registry'

export default {
  name: 'PageStoreDevPanel',

  data() {
    return {
      selectedId: null,
      tick: 0
    }
  },

  computed: {
    registry() {
      return getGlobalRegistry()
    },

    stores() {
      return Array.from(this.registry.stores.values())
    },

    selectedStore() {
      return this.stores.find(s => s.id === this.selectedId) || this.stores[0]
    },

    filteredEvents() {
      if (!this.selectedStore) return []

      return this.registry.events
        .filter(e => e.storeId === this.selectedStore.id)
        .slice()
        .reverse()
        .slice(0, 30)
    }
  },

  mounted() {
    this.timer = setInterval(() => {
      this.tick++

      if (!this.selectedId && this.stores.length) {
        this.selectedId = this.stores[0].id
      }
    }, 500)
  },

  beforeDestroy() {
    clearInterval(this.timer)
  },

  methods: {
    safeJson(val) {
      try {
        return JSON.stringify(val, null, 2)
      } catch (e) {
        return '[Unserializable]'
      }
    },

    readGetters(store) {
      if (!store || !store.getters) return {}

      const out = {}

      Object.keys(store.getters).forEach(key => {
        try {
          out[key] = store.getters[key]
        } catch (e) {
          out[key] = '[Error]'
        }
      })

      return out
    },

    formatTime(ts) {
      const d = new Date(ts)
      return d.toLocaleTimeString()
    }
  }
}
</script>

<style scoped>
.ps-devtools {
  position: fixed;
  bottom: 10px;
  right: 10px;
  width: 500px;
  height: 400px;
  background: #1e1e1e;
  color: #eee;
  font-size: 12px;
  z-index: 99999;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ps-devtools__header {
  padding: 6px 10px;
  background: #333;
  font-weight: bold;
}

.ps-devtools__body {
  flex: 1;
  display: flex;
}

.ps-devtools__sidebar {
  width: 180px;
  border-right: 1px solid #444;
  overflow-y: auto;
}

.ps-devtools__store {
  padding: 6px;
  cursor: pointer;
  border-bottom: 1px solid #333;
}

.ps-devtools__store.active {
  background: #444;
}

.ps-devtools__main {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
}

.meta {
  font-size: 10px;
  color: #aaa;
}

pre {
  background: #111;
  padding: 6px;
  border-radius: 4px;
  overflow-x: auto;
}

.event {
  border-bottom: 1px solid #333;
  padding: 2px 0;
}
</style>