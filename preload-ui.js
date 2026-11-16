'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tessera', {
  invoke: (name, ...args) => ipcRenderer.invoke('ui:' + name, ...args),
  on: (channel, cb) => {
    if (!['state', 'toast', 'thumb'].includes(channel)) return;
    ipcRenderer.on(channel, (_e, ...a) => cb(...a));
  },
});
