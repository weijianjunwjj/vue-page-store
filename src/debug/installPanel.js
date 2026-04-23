import Vue from 'vue';
import { isDev } from './registry.js';
import DevPanel from './DevPanel.vue';

var _mounted = false;

export function installDevPanel() {
  if (!isDev) return;
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