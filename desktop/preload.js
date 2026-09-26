const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('h2o', {
  setClickable: (on) => ipcRenderer.send('overlay:clickable', on),
  choose: (choice) => ipcRenderer.send('overlay:choice', choice),
  close: () => ipcRenderer.send('overlay:close'),
});
