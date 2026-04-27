import Vue from 'vue';
import DevPanel from './DevPanel.vue';

var _mounted = false;

export function installDevPanel() {
  // 不 import registry —— 避免和 dist/index.esm.js 内联的 registry 产生双实例
  // 直接检查 window.PAGE_STORE_DEVTOOLS 是否已被主入口创建
  if (typeof window === 'undefined' || !window.PAGE_STORE_DEVTOOLS) return;
  if (_mounted) return;
  if (typeof document === 'undefined') return;
  _mounted = true;

  var mount = function () {
    try {
      var host = document.createElement('div');
      host.id = '__vps_devpanel__';
      document.body.appendChild(host);
      new Vue({ render: function (h) { return h(DevPanel); } }).$mount(host);
    } catch (e) {
      console.warn('[vue-page-store] DevPanel mount failed:', e);
    }
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
}