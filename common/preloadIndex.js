const { contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    invokeFuncion:  (data) => ipcRenderer.invoke('invokeFuncion', data),
    invokeReceptor: (data) => ipcRenderer.on('invokeReceptor', data),

    invokeFunNotificacion:  (data) => ipcRenderer.invoke('invokeFunNotificacion', data),
    invokeReceptorNotificacion:  (data) => ipcRenderer.on('invokeReceptorNotificacion', data),
})