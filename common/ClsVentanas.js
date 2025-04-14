const { app, BrowserWindow, ipcMain, shell, clipboard, globalShortcut, screen } = require('electron');
const path = require('path');

class Ventanas{
  
  constructor(_devTools){
    this.devTools = _devTools
    this.icono    = "../ico/icon.png"
    this.preload  = "./preloadIndex.js"
    this.otrasVentanas = []
    this.cerrar_todo = false
  }

  crearNueva = (config) => {
    // console.log(config)
    let ventana = new BrowserWindow({
      show: config.show || true,
      width: config.width || 800,
      height: config.height || 600,
      minWidth: config.minWidth || 400,
      minHeight: config.minHeight || 300,
      x: config.x || undefined,
      y: config.y || undefined,
      autoHideMenuBar: config.autoHideMenuBar || false,
      frame: config.frame,
      transparent: config.transparent,
      hasShadow: config.hasShadow,
      skipTaskbar: config.skipTaskbar,
      webPreferences: {
        nodeIntegration: config.webPreferences?.nodeIntegration || true,
        contextIsolation: config.webPreferences?.contextIsolation || true,
        preload: path.join(__dirname, this.preload),
        devTools: this.devTools || false,
      },
    });
    ventana.setIcon(path.join(__dirname, this.icono))
    if (config.url) {
      ventana.loadURL(config.url);
    }else{
      ventana.loadFile( path.join(__dirname, config.file))
    }
    if (this.devTools) {
      ventana.webContents.openDevTools()
    }else{
      ventana.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.key === 'i') {
          event.preventDefault()
        }
        if (input.control && input.shift && input.key === 'r') {
          event.preventDefault()
        }
        if (input.control && input.key === 'r') {
          event.preventDefault()
        }
        if (input.alt) {
          event.preventDefault()
        }  
      })
    }
    ventana.on('ready-to-show', () =>{
      if (!config.url) ventana.show()
    })
    if (config.siempreTop){
      ventana.setAlwaysOnTop(true, 'screen')
    }
    if (config.closeAlCerrar){
      ventana.on('closed', () => {
        this.cerrar_todo = true
        this.otrasVentanas.forEach(element => {
          try{element.close()}
          catch(e){}
        });
        app.quit()
      })
    }else{
      this.otrasVentanas.push(ventana)
    }
    return ventana;
  }

  crearVentana = (_rutaVista, _width, _heigth, _minWidth, _minHeighh, _x, _y, _preload, _closeAlCerrar, _autoHideBarra = false, _frame = true, _siempreTop = false, _transparent = false, _url, _nocerrar, _url2="") => {
    let ventana = new BrowserWindow({
      show:false,
      width: _width, height: _heigth,
      minWidth:_minWidth, minHeight:_minHeighh,
      x: _x, y: _y,
      autoHideMenuBar:_autoHideBarra,
      frame: _frame,
      transparent: _transparent,
      hasShadow: false,
      webPreferences: {
        nodeIntegration:true,
        contextIsolation: true,
        preload: _preload,
        devTools: this.devTools,
      },
    })
    ventana.setIcon(path.join(__dirname, this.icono))
    if (_url) {
      try{
        ventana.loadURL(_url)
        // console.log(" ")
        // alert("se esta pre", _url)
        // alert("se esta pre 2", _url2)
        // console.log(" ")
        ventana.webContents.on('did-finish-load', () => {
          ventana.webContents.executeJavaScript(`
            var completado = 0
            var ejecutado = false
            function myTimer() {
              // console.log(window.location.href)
              window.electronAPI.invokeFuncion({funcion:'noLoginTiktok', url:window.location.href})
              document.querySelectorAll("video, audio").forEach(elem => {
                elem.muted = true;
                elem.pause();
              });
              if (window.location.href.includes("https://www.tiktok.com/login")){
                if (document.readyState === 'complete'){
                  if (completado >= 2 && !${_nocerrar}){
                    window.electronAPI.invokeFuncion({funcion:'noLoginTiktok', estado:false})
                  }else{
                    completado++
                  }
                } 
              }else if ((window.location.href.includes("https://www.tiktok.com/@") ||  window.location.href.includes("https://www.tiktok.com/foryou")) && "${_url2}" === ""){
                window.electronAPI.invokeFuncion({funcion:'noLoginTiktok', estado:true, url:window.location.href})
                return true
              }else if ((window.location.href.includes("https://www.tiktok.com/?lang") ||  window.location.href.includes("https://www.tiktok.com/foryou")) && "${_url2}" !== ""){
                if (ejecutado) return
                ejecutado = true
                console.log("Navegando a -> ${_url2}")
                fetch('${_url2}')
                .then(response => {
                  if (!response.ok) {
                    throw new Error('Network response was not ok ' + response.statusText);
                  }
                  return response.json(); // Parsear la respuesta como JSON
                })
                .then(data => {
                  console.log(data); // Manejar el JSON que recibiste
                })
                .catch(error => {
                  console.error('Hubo un problema con la operación fetch:', error);
                });
              }else if (window.location.href.includes("get_sub_emote_detail")){
                console.log(window.location)
              }else{
                console.log("otro")
              }
            }
            setInterval(myTimer, 2000)
          `);
        });
        ventana.on('close', (event) => {
          if (_transparent && !this.cerrar_todo){
            event.preventDefault();
            ventana.hide();
          }
        });
        ventana.webContents.setAudioMuted(true)
      }catch(e){
        console.log(e)
      }
    }
    else ventana.loadFile(_rutaVista)
    if (this.devTools) {
      ventana.webContents.openDevTools()
    }else{
      ventana.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.key === 'i') {
          event.preventDefault()
        }
        if (input.control && input.shift && input.key === 'r') {
          event.preventDefault()
        }
        if (input.control && input.key === 'r') {
          event.preventDefault()
        }
        if (input.alt) {
          event.preventDefault()
        }  
      })
    }
    ventana.on('ready-to-show', () =>{
      if (!_url) ventana.show()
      ventana.webContents.on("console-message", (event, level, message, line, sourceId) => {
      //  console.log(`[CONSOLE ${level}] ${message} (Line: ${line}, Source: ${sourceId})`);
      });
    })
    if (_siempreTop){
      ventana.setAlwaysOnTop(true, 'screen')
    }
    if (_closeAlCerrar){
      ventana.on('closed', () => {
        this.cerrar_todo = true
        this.otrasVentanas.forEach(element => {
          try{element.close()}
          catch(e){}
        });
        app.quit()
      })
    }else{
      this.otrasVentanas.push(ventana)
    }
    return ventana
  }

  crearNavegador = (_url, nocerrar) => {
    // console.log("creando ventana navegador hidden")
    console.log("creando ventana navegador hidden 1", _url)
    return this.crearVentana(
      path.join(__dirname, ''), 
      620, 865, //tamaño
      620, 865, //tamaño minimo
      null, null,     // posicion
      path.join(__dirname, this.preload), 
      false,    // cerra app al cerrar ventana
      false,     // ocultar barra superior
      true,      // frames de ventana
      false,
      false,
      _url,
      nocerrar,
      ""
    )//Log in
  }

  crearNavegador2 = (_url, _url2) => {
    console.log("creando ventana navegador hidden", _url)
    console.log("creando ventana navegador hidden", _url2)
    return this.crearVentana(
      path.join(__dirname, ''), 
      620, 865, //tamaño
      620, 865, //tamaño minimo
      null, null,     // posicion
      path.join(__dirname, this.preload), 
      false,    // cerra app al cerrar ventana
      false,     // ocultar barra superior
      true,      // frames de ventana
      false,
      false,
      _url,
      false,
      _url2
    )//Log in
  }

  crearReconexion = (_path) => {
    const _winWidth  = 400;
    const _winHeight = 100;
    const barra      = screen.getPrimaryDisplay().size.height - screen.getPrimaryDisplay().workArea.height
    const x          = screen.getPrimaryDisplay().size.width  - _winWidth  - 10; // 10 pixels de margen
    const y          = screen.getPrimaryDisplay().size.height - _winHeight - barra - 10; // 10 pixels de margen
    return this.crearVentana(
      path.join(__dirname, _path), 
      _winWidth, _winHeight, 
      _winWidth, _winHeight, 
      x, y,   // posicion
      null,   // preload
      false,  // cerra app al cerrar ventana
      true,   // ocultar barra superior
      false,  // frames de ventana
      true    // siempre encima
    )
  }

  crearLogin = (_path) => {
    return this.crearVentana(
      path.join(__dirname, _path), 
      800, 450, //tamaño
      800, 450, //tamaño minimo
      null, null,     // posicion
      path.join(__dirname, this.preload), 
      false,    // cerra app al cerrar ventana
      true,     // ocultar barra superior
      true      // frames de ventana
    )
  }

  crearPrincipal = (_path) => {
    return this.crearVentana(
      path.join(__dirname, _path), 
      screen.getPrimaryDisplay().size.width, screen.getPrimaryDisplay().size.height, //tamaño
      620, 865, //tamaño minimo
      0, 0,     // posicion
      path.join(__dirname, this.preload), 
      true,     // cerra app al cerrar ventana
      true,     // ocultar barra superior
      true      // frames de ventana
    )
  }

  crearPublicidad = (_path) => {
    return this.crearVentana(
      path.join(__dirname, _path),
      600, 250,
      null, null,
      null, null,
      path.join(__dirname, this.preload),
      false,
      true,
      false,
      true,
      true
    )
  }

  crearHistorial = (_path) => {
    return this.crearVentana(
      path.join(__dirname, _path),
      430, 415,
      null, null, 
      null, null,
      path.join(__dirname, this.preload),
      false,
      true,
      false,
      true,
      true
    )
  }

  crearTimer = (_path) => {
    return this.crearVentana(
      path.join(__dirname, _path),
      600, 200,
      null, null, 
      null, null,
      path.join(__dirname, this.preload),
      false,
      true,
      false,
      true,
      true
    )
  }

  crearRanking = (_path) => {
    return this.crearVentana(
      path.join(__dirname, _path),
      370, 500,
      null, null, 
      null, null,
      path.join(__dirname, this.preload),
      false,
      true,
      false,
      true,
      true
    )
  }

  crearReproductorVideo = (_path) => {
    return this.crearVentana(
      path.join(__dirname, _path),
      570, 300,
      null, null, 
      null, null,
      path.join(__dirname, this.preload),
      false,
      true,
      false,
      true,
      true
    )
  }

  crearAlertaPago = (_path) => {
    return this.crearVentana(
      path.join(__dirname, _path),
      500, 500,
      500, 500,
      null, null, 
      path.join(__dirname, this.preload),
      false,
      true,
      true,
      true,
      false
    )
  }

  crearVentanaVersion = (_path) => {
    return this.crearVentana(
      path.join(__dirname, _path),
      500, 300,
      500, 300,
      null, null,
      path.join(__dirname, this.preload),
      false,
      true,
      true,
      true,
      false
    )
  }

  crearUpdater = (_path) => {
    return this.crearVentana(
      path.join(__dirname, _path), 
      400, 400, //tamaño
      400, 400, //tamaño minimo
      null, null,     // posicion
      path.join(__dirname, this.preload), 
      true,    // cerra app al cerrar ventana
      true,     // ocultar barra superior
      false      // frames de ventana
    )
  }

}
module.exports = Ventanas
