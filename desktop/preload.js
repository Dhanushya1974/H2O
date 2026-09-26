const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('h2o', {
  // overlay
  setClickable: (on) => ipcRenderer.send('overlay:clickable', on),
  choose: (choice) => ipcRenderer.send('overlay:choice', choice),
  close: () => ipcRenderer.send('overlay:close'),
  // control window
  getState: () => ipcRenderer.invoke('control:get'),
  onState: (cb) => ipcRenderer.on('control:state', (_e, state) => cb(state)),
  action: (name) => ipcRenderer.send('control:action', name),
});
