// electron/preload.js — secure bridge between renderer (setup.html) and main
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lavira', {
  saveKeys:  (keys)  => ipcRenderer.invoke('save-keys', keys),
  getStatus: ()      => ipcRenderer.invoke('get-status'),
  onSetupComplete: () => ipcRenderer.send('setup-complete'),
});
