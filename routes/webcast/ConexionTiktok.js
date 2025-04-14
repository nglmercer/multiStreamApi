const EventEmitter = require("events");
const SocketIO = require("socket.io-client");
const WebcastWebsocket = require("./webcastWebsocket2");
const axios = require("axios");
const { session } = require("electron");

function parseStickerData(response, callback, stickersArray) {
  console.log("res stickers => ", response);
  
  // Reset stickers array
  stickersArray.length = 0;
  
  const data = response.data;
  
  // Process different types of sticker data
  const stickerSources = [
    { path: 'data.current_emote_detail.emote_list', type: 'standard' },
    { path: 'data.emote_config.default_emote_list', type: 'standard' },
    { path: 'data.highest_sub_wave_strike_custom_emote.emote_list', type: 'standard' },
    { path: 'data.stable_emote_detail.emote_list', type: 'standard' },
    { path: 'data.sub_wave_custom_emote.emote_list', type: 'standard' },
    { path: 'data.package_emote_list', type: 'package' }
  ];
  
  // Process each sticker source
  stickerSources.forEach(source => {
    try {
      let emoteList = getNestedProperty(data, source.path);
      
      if (Array.isArray(emoteList)) {
        if (source.type === 'standard') {
          // Standard emote processing
          emoteList.forEach(emote => {
            emote.image.url_list.forEach(url => {
              if (url.startsWith("https://p16") && 
                !stickersArray.some(item => item.emote_id === emote.emote_id)) {
                stickersArray.push({
                  emote_id: emote.emote_id,
                  img: url
                });
              }
            });
          });
        } else if (source.type === 'package') {
          // Package emote processing
          emoteList.forEach(pkg => {
            pkg.emote_detail.emote_list.forEach(emote => {
              if (emote.startsWith("https://p16") && 
                !stickersArray.some(item => item.emote_id === emote.emote_id)) {
                stickersArray.push({
                  emote_id: emote.emote_id,
                  img: emote
                });
              }
            });
          });
        }
      }
    } catch (error) {
      // Silently catch errors for missing properties
    }
  });
  
  console.log("this.stickers_arr => ", stickersArray.length);
  callback(stickersArray);
}

/**
 * Safely access nested properties in an object
 * @param {Object} obj - The object to access
 * @param {String} path - Path to the property (dot notation)
 * @returns {*} - The value or undefined if not found
 */
function getNestedProperty(obj, path) {
  return path.split('.').reduce((prev, curr) => {
    return prev && prev[curr] !== undefined ? prev[curr] : undefined;
  }, obj);
}

/**
 * Update URL parameters
 * @param {String} url - The URL to update
 * @param {Object} params - Parameters to update
 * @returns {String} - Updated URL
 */
function updateUrlParams(url, params) {
  let [baseUrl, queryString] = url.split("?");
  if (!queryString) return url;
  
  let urlParams = new URLSearchParams(queryString);
  for (let key in params) {
    if (urlParams.has(key)) {
      urlParams.set(key, params[key]);
    }
  }
  
  return `${baseUrl}?${urlParams.toString()}`;
}

/**
 * Process and decode message data
 * @param {Object} data - The message data to decode
 * @returns {Object} - Processed message data
 */
function handleMessageDecoding(data) {
  // Handle special fields
  if (data.questionDetails) {
    Object.assign(data, data.questionDetails);
    delete data.questionDetails;
  }
  
  if (data.user) {
    Object.assign(data, parseUser(data.user));
    delete data.user;
  }
  
  if (data.event) {
    Object.assign(data, parseEventData(data.event));
    delete data.event;
  }
  
  if (data.eventDetails) {
    Object.assign(data, data.eventDetails);
    delete data.eventDetails;
  }
  
  // Process top viewers
  if (data.topViewers) {
    data.topViewers = parseTopViewers(data.topViewers);
  }
  
  // Process battle users
  if (data.battleUsers) {
    let battleUsers = [];
    data.battleUsers.forEach(user => {
      if (user?.battleGroup?.user) {
        battleUsers.push(parseUser(user.battleGroup.user));
      }
    });
    data.battleUsers = battleUsers;
  }
  
  // Process battle items
  if (data.battleItems) {
    data.battleArmies = [];
    data.battleItems.forEach(item => {
      item.battleGroups.forEach(group => {
        let battleGroup = {
          hostUserId: item.hostUserId.toString(),
          points: parseInt(group.points),
          participants: []
        };
        
        group.users.forEach(user => {
          battleGroup.participants.push(parseUser(user));
        });
        
        data.battleArmies.push(battleGroup);
      });
    });
    delete data.battleItems;
  }
  
  // Process gift data
  if (data.giftId) {
    data.repeatEnd = !!data.repeatEnd;
    data.gift = {
      gift_id: data.giftId,
      repeat_count: data.repeatCount,
      repeat_end: data.repeatEnd ? 1 : 0,
      gift_type: data.giftDetails?.giftType
    };
    
    if (data.giftDetails) {
      Object.assign(data, data.giftDetails);
      delete data.giftDetails;
    }
    
    if (data.giftImage) {
      Object.assign(data, data.giftImage);
      delete data.giftImage;
    }
    
    if (data.giftExtra) {
      Object.assign(data, data.giftExtra);
      delete data.giftExtra;
      
      if (data.receiverUserId) {
        data.receiverUserId = data.receiverUserId.toString();
      }
      
      if (data.timestamp) {
        data.timestamp = parseInt(data.timestamp);
      }
    }
    
    if (data.groupId) {
      data.groupId = data.groupId.toString();
    }
    
    // Parse monitor extra data if it's a JSON string
    if (typeof data.monitorExtra === 'string' && data.monitorExtra.indexOf('{') === 0) {
      try {
        data.monitorExtra = JSON.parse(data.monitorExtra);
      } catch (error) {
        // Ignore parsing errors
      }
    }
  }
  
  // Process emote data
  if (data.emote) {
    data.emoteId = data.emote?.emoteId;
    data.emoteImageUrl = data.emote?.image?.imageUrl;
    delete data.emote;
  }
  
  if (data.emotes) {
    data.emotes = data.emotes.map(emote => ({
      emoteId: emote.emote?.emoteId,
      emoteImageUrl: emote.emote?.image?.imageUrl,
      placeInComment: emote.placeInComment
    }));
  }
  
  // Process treasure box data
  if (data.treasureBoxUser) {
    try {
      const userPath = data.treasureBoxUser?.user2?.user3[0]?.user4?.user;
      if (userPath) {
        Object.assign(data, parseUser(userPath) || {});
      }
    } catch (error) {
      // Handle potential missing fields in path
    }
    delete data.treasureBoxUser;
  }
  
  if (data.treasureBoxData) {
    Object.assign(data, data.treasureBoxData);
    delete data.treasureBoxData;
    
    if (data.timestamp) {
      data.timestamp = parseInt(data.timestamp);
    }
  }
  
  return Object.assign({}, data);
}

/**
 * Parse event data
 * @param {Object} event - The event data
 * @returns {Object} - Processed event data
 */
function parseEventData(event) {
  if (event.msgId) {
    event.msgId = event.msgId.toString();
  }
  
  if (event.createTime) {
    event.createTime = event.createTime.toString();
  }
  
  return event;
}

/**
 * Parse top viewers data
 * @param {Array} topViewers - The top viewers data
 * @returns {Array} - Processed top viewers data
 */
function parseTopViewers(topViewers) {
  return topViewers.map(viewer => ({
    user: viewer.user ? parseUser(viewer.user) : null,
    coinCount: viewer.coinCount ? parseInt(viewer.coinCount) : 0
  }));
}
function getProfilePictureUrl(pictureUrls) {
  // Handle cases where pictureUrls is null, undefined, not an array, or an empty array
  if (!pictureUrls || !Array.isArray(pictureUrls) || pictureUrls.length === 0) {
    return null;
  }

  // Try to find the best formats in order of preference
  return (
    // 1. Prefer 100x100 WebP
    pictureUrls.find(url => typeof url === 'string' && url.includes('100x100') && url.includes('.webp')) ||
    // 2. Then prefer 100x100 JPEG
    pictureUrls.find(url => typeof url === 'string' && url.includes('100x100') && url.includes('.jpeg')) ||
    // 3. Then prefer any URL that doesn't seem to be a resized/shrunk version
    pictureUrls.find(url => typeof url === 'string' && !url.includes('shrink')) ||
    // 4. Fallback to the very first URL in the list if it's a string
    (typeof pictureUrls[0] === 'string' ? pictureUrls[0] : null) ||
    // 5. Final fallback if the first element wasn't even a string
    null
  );
}
/**
 * Parse user data
 * @param {Object} user - The user data to parse
 * @returns {Object} - Processed user data
 */
function parseUser(user) {
  let parsedUser = {
    userId: user.userId?.toString(),
    secUid: user.secUid?.toString(),
    uniqueId: user.uniqueId !== '' ? user.uniqueId : undefined,
    nickname: user.nickname !== '' ? user.nickname : undefined,
    profilePictureUrl: getProfilePictureUrl(user.profilePicture?.urls),
    followRole: user.followInfo?.followStatus,
    userBadges: parseUserBadges(user.badges),
    userSceneTypes: user.badges?.map(badge => (badge?.badgeSceneType) || 0),
    userDetails: {
      createTime: user.createTime?.toString(),
      bioDescription: user.bioDescription,
      profilePictureUrls: user.profilePicture?.urls
    }
  };

  if (user.followInfo) {
    parsedUser.followInfo = {
      followingCount: user.followInfo.followingCount,
      followerCount: user.followInfo.followerCount,
      followStatus: user.followInfo.followStatus,
      pushStatus: user.followInfo.pushStatus
    };
  }

  // Add computed properties
  parsedUser.isModerator = parsedUser.userBadges.some(badge => 
    (badge.type && badge.type.toLowerCase().includes("moderator")) || 
    badge.badgeSceneType === 1
  );
  
  parsedUser.isNewGifter = parsedUser.userBadges.some(badge => 
    badge.type && badge.type.toLowerCase().includes("live_ng_")
  );
  
  parsedUser.isSubscriber = parsedUser.userBadges.some(badge => 
    (badge.url && badge.url.toLowerCase().includes("/sub_")) || 
    badge.badgeSceneType === 4 || 
    badge.badgeSceneType === 7
  );
  
  // Get top gifter rank if available
  const topGifterBadge = parsedUser.userBadges.find(badge => 
    badge.url && badge.url.includes("/ranklist_top_gifter_")
  );
  
  if (topGifterBadge && topGifterBadge.url) {
    const rankMatch = topGifterBadge.url.match(/(?<=ranklist_top_gifter_)(\d+)(?=.png)/g);
    parsedUser.topGifterRank = rankMatch ? Number(rankMatch[0]) : null;
  } else {
    parsedUser.topGifterRank = null;
  }
  
  // Get gifter level
  const gifterBadge = parsedUser.userBadges.find(badge => badge.badgeSceneType === 8);
  parsedUser.gifterLevel = gifterBadge ? gifterBadge.level : 0;
  
  // Get team member level
  const teamBadge = parsedUser.userBadges.find(badge => badge.badgeSceneType === 10);
  parsedUser.teamMemberLevel = teamBadge ? teamBadge.level : 0;
  
  return parsedUser;
}
function parseUserBadges(badges) {
  let simplifiedBadges = [];

  // Verifica si 'badges' es un array antes de intentar iterar sobre él
  // Es importante porque a veces la propiedad 'badges' puede no existir o no ser un array.
  if (Array.isArray(badges)) {
    // Itera sobre cada grupo principal de insignias. A veces TikTok agrupa insignias por 'badgeSceneType'.
    badges.forEach(innerBadges => {
      // Guarda el badgeSceneType general para este grupo. Usa encadenamiento opcional (?.)
      // por si innerBadges es null o undefined.
      let badgeSceneType = innerBadges?.badgeSceneType;

      // Procesa las insignias "normales" (las que están dentro de la propiedad 'badges' del grupo)
      if (Array.isArray(innerBadges?.badges)) {
        innerBadges.badges.forEach(badge => {
          // Combina las propiedades de la insignia individual ('badge') con el
          // 'badgeSceneType' del grupo al que pertenece.
          // Object.assign crea un nuevo objeto.
          simplifiedBadges.push(Object.assign({
            badgeSceneType // Añade la propiedad badgeSceneType
          }, badge));      // Copia todas las propiedades de la insignia original
        });
      }

      // Procesa las insignias de tipo imagen (las que están dentro de 'imageBadges')
      if (Array.isArray(innerBadges?.imageBadges)) {
        innerBadges.imageBadges.forEach(badge => {
          // Se asegura de que la insignia de imagen tenga una URL válida antes de añadirla.
          // Usa encadenamiento opcional para evitar errores si 'badge' o 'image' no existen.
          if (badge?.image?.url) {
            simplifiedBadges.push({
              type: 'image', // Identifica esta insignia como de tipo imagen
              badgeSceneType, // Añade el badgeSceneType del grupo
              displayType: badge.displayType, // Tipo de visualización (si existe)
              url: badge.image.url // La URL de la imagen de la insignia
            });
          }
        });
      }

      // Procesa las insignias de privilegio (ej: nivel de suscriptor, nivel de donador)
      // Se basa en la existencia y valor de 'privilegeLogExtra'.
      const privilegeLogExtra = innerBadges?.privilegeLogExtra;
      // Verifica que exista 'privilegeLogExtra', que tenga una propiedad 'level' y que 'level' no sea '0' (un nivel 0 usualmente no representa un privilegio activo).
      if (privilegeLogExtra?.level && privilegeLogExtra.level !== '0') {
        simplifiedBadges.push({
          type: 'privilege', // Identifica esta insignia como de tipo privilegio
          badgeSceneType: innerBadges?.badgeSceneType, // Usa el badgeSceneType del grupo (puede ser undefined)
          privilegeId: privilegeLogExtra.privilegeId, // ID del privilegio
          level: parseInt(privilegeLogExtra.level, 10), // Convierte el nivel (que viene como string) a número entero
        });
      }
    });
  }

  // Devuelve el array con todas las insignias individuales procesadas y simplificadas.
  return simplifiedBadges;
}

// Constants for events
const EVENTS = {
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  ERROR: "error",
  RAWDATA: "rawData",
  DECODEDDATA: "decodedData",
  STREAMEND: "streamEnd",
  WSCONNECTED: "websocketConnected"
};

// Constants for message types
const MESSAGE_TYPES = {
  CHAT: "chat",
  MEMBER: "member",
  GIFT: "gift",
  ROOMUSER: "roomUser",
  SOCIAL: "social",
  LIKE: "like",
  QUESTIONNEW: "questionNew",
  LINKMICBATTLE: "linkMicBattle",
  LINKMICARMIES: "linkMicArmies",
  LIVEINTRO: "liveIntro",
  EMOTE: "emote",
  ENVELOPE: "envelope",
  SUBSCRIBE: "subscribe"
};

// Constants for social types
const SOCIAL_TYPES = {
  FOLLOW: "follow",
  SHARE: "share"
};

class ConexionTiktok extends EventEmitter {
  constructor(username, browser) {
    super();
    this.username = username;
    this.websocket = null;
    this.shouldReconnect = false;
    this.isConnected = false;
    this.isProcessing = false;
    this.browser = null;
    this.extraData = null;
    this.browserInstance = browser;
    this.stickersArray = [];
    this.cookies = null;
    this.stickersUrl = null;
  }

  async obtenerStickers(callback) {
    if (this.connectionMode === "remoto") {
      try {
        this.socket = SocketIO(`http://${process.env.IP_FIRMA}:${process.env.PUERTO}`);
        
        this.socket.on("connect", () => {
          this.socket.emit("stickers", { 
            user: this.username, 
            stickers: this.stickersUrl, 
            galletitas: this.cookies 
          });
        });
        
        this.socket.on("stickers_res", async response => {
          parseStickerData(response.stickers, callback, this.stickersArray);
          this.socket.disconnect();
        });
      } catch (error) {
        this.socket.emit("stickers", { 
          user: this.username, 
          stickers: this.stickersUrl, 
          galletitas: this.cookies 
        });
      }
    } else {
      console.log("sacando stickers");
      const cookieString = this.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
      const response = await axios.get(this.stickersUrl, {
        headers: {
          Cookie: cookieString
        }
      });
      
      parseStickerData(response.data, callback, this.stickersArray);
    }
  }

  // Fix for the q function
  updateUrlWithParams(url, params) {
    let [baseUrl, queryString] = url.split("?");
    if (!queryString) return url;
    
    let urlParams = new URLSearchParams(queryString);
    for (let key in params) {
      if (urlParams.has(key)) {
        urlParams.set(key, params[key]);
      }
    }
    
    return `${baseUrl}?${urlParams.toString()}`;
  }

  async connect(connectionMode) {
    if (this.isProcessing) return;
    
    let status = await this.obtenerStatus();
    if (status.status === 4) {
      return { res: "error", texto: "error2" };
    }

    this.connectionMode = connectionMode;

    if (connectionMode === "remoto") {
      return new Promise((resolve, reject) => {
        if (this.isConnected) return;

        this.socket = SocketIO(`http://${process.env.IP_FIRMA}:${process.env.PUERTO}`);
        this.shouldReconnect = true;

        this.socket.on("connect", () => {
          console.log("Conectado al servidor");
          if (!this.isProcessing) {
            this.isProcessing = true;
            console.log("pidiendo firma");
            console.log({ username: this.username, hash: this.hash, version: "1" });
            this.socket.emit("requestLiveData", {
              username: this.username,
              hash: this.hash,
              version: "1"
            });
          }
        });

        this.socket.on("liveData", async response => {
          if (this.isConnected && !this.shouldReconnect) return;
          
          console.log("liveData");
          this.stickersUrl = response.stickers;
          this.cookies = response.cookies;
          
          this.connectWebSocket(response.url, response.cookies)
            .then(result => {
              console.log("fin");
              this.socket.disconnect();
              result ? resolve({ res: "ok" }) : reject({ res: "error" });
            });
        });

        this.socket.on("errorLive", error => {
          console.error("Error de conexión al servidor");
          reject({ res: "error", texto: "errorLive" });
        });

        this.socket.on("rety", error => {
          console.error("Error de retry");
          reject({ res: "error", texto: "retry" });
        });

        this.socket.on("timeout", error => {
          console.error("Error de timeout");
          reject({ res: "error", texto: "timeout" });
        });

        this.socket.on("nolive", error => {
          console.error("Error de timeout");
          reject({ res: "error", texto: "timeout" });
        });

        this.socket.on("sin_plugins", () => {
          this.isProcessing = false;
          this.socket.disconnect();
          reject({ res: "error", texto: "firmas" });
        });

        this.socket.on("disconnect", () => {
          console.log("Desconectado del servidor");
        });
      });
    } else {
      return new Promise(async (resolve, reject) => {
        console.log(`url => https://www.tiktok.com/@${this.username}/live`);
        this.browser = this.browserInstance.crearNavegador(`https://www.tiktok.com/@${this.username}/live`);
        
        this.captureTikTokData().then(async data => {
          let urlParams = { client_enter: "0" };
          data.url = this.updateUrlWithParams(data.url, urlParams);
          this.stickersUrl = data.stickers;
          this.cookies = data.galletas;
          
          this.connectWebSocket(data.url, data.galletas).then(result => {
            result ? resolve({ res: "ok" }) : reject({ res: "error" });
          });
        });
      });
    }
  }

  captureTikTokData = async () => {
    return new Promise(async (resolve, reject) => {
      let websocketUrl = "";
      let cookiesData = "";
      let stickersUrl = "";

      session.defaultSession.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, async (details, callback) => {
        if (details.url.includes("webcast16-ws-useast1a.tiktok.com")) {
          websocketUrl = details.url;
          let cookies = await session.defaultSession.cookies.get({ url: details.url });
          cookiesData = cookies;

          if (websocketUrl !== "" && stickersUrl !== "" && cookiesData !== "") {
            if (this.browser) this.browser.close();
            resolve({ url: websocketUrl, galletas: cookiesData, stickers: stickersUrl });
          }
        } else if (details.url.includes("get_sub_emote_detail")) {
          stickersUrl = details.url;
          if (websocketUrl !== "" && stickersUrl !== "" && cookiesData !== "") {
            if (this.browser) this.browser.close();
            resolve({ url: websocketUrl, galletas: cookiesData, stickers: stickersUrl });
          }
        }
        
        callback({ cancel: false });
      });
    });
  };

  connectWebSocket = async (url, cookies) => {
    console.log(url);
    
    return new Promise(async (resolve, reject) => {
      const cookieObj = {};
      cookies.forEach(cookie => {
        cookieObj[cookie.name] = cookie.value;
      });

      const cookieJar = {
        getCookieString: () => cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ")
      };

      if (this.websocket !== null) {
        this.websocket.disconnect();
        this.websocket = null;
      }

      this.isProcessing = false;
      this.websocket = new WebcastWebsocket(url, cookies, {}, {}, cookieObj, {});

      this.websocket.on("webcastResponse", response => {
        this.handleWebcastResponse(response);
      });

      this.websocket.on("messageDecodingFailed", error => {
        console.error("Error al decodificar el mensaje:", error);
        reject({ res: "error", texto: error.toString() });
      });

      this.websocket.on("conectado", () => {
        console.log("WebSocket conectado");
        this.isConnected = true;
        resolve({ res: "ok" });
      });

      this.websocket.on("error", error => {
        console.error("WebSocket error:", error);
        reject({ 
          res: "error", 
          texto: error.toString(), 
          evento: "error_wss" 
        });
      });

      this.websocket.on("disconnected", () => {
        this.shouldReconnect = true;
        console.log("desconectado");
        console.log("this.reconectar", this.shouldReconnect);
        this.emit("disconnected", {});
      });
    });
  };

  async obtenerStatus() {
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Connection: "keep-alive"
      }
    };

    const response = await axios.get(
      `https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=${this.username}`,
      options
    );

    let status = response?.data?.data?.user?.status;
    let roomId = response?.data?.data?.user?.roomId;

    return { status, roomId };
  }

  async obtenerRegalos() {
    let statusData = await this.obtenerStatus();
    
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Connection: "keep-alive"
      }
    };

    if (statusData.roomId !== undefined) {
      let url = `https://webcast.tiktok.com/webcast/gift/list/?aid=1988&app_language=en-US&app_name=tiktok_web&browser_language=en&browser_name=Mozilla&browser_online=true&browser_platform=Win32&Mozilla%2F5.0%20%28Windows%20NT%2010.0%3B%20Win64%3B%20x64%3B%20rv%3A128.0%29%20Gecko%2F20100101%20Firefox%2F128.0&cookie_enabled=true&cursor=&internal_ext=&device_platform=web&focus_state=true&from_page=user&history_len=0&is_fullscreen=false&is_page_visible=true&did_rule=3&fetch_rule=1&last_rtt=0&live_id=12&resp_content_type=protobuf&screen_height=1152&screen_width=2048&tz_name=Europe%2FBerlin&referer=https%3A%2F%2Fwww.tiktok.com%2F&root_referer=https%3A%2F%2Fwww.tiktok.com%2F&host=https%3A%2F%2Fwebcast.tiktok.com&version_code=270000&webcast_sdk_version=1.3.0&update_version_code=1.3.0&room_id=${statusData.roomId}`;
      
      const response = await axios.get(url, options);

      try {
        const gifts = [
          ...response?.data?.data?.pages[0]?.gifts || [],
          ...response?.data?.data?.pages[1]?.gifts || [],
          ...response?.data?.data?.gifts
        ];

        return Array.from(new Set(gifts.map(gift => gift.id)))
          .map(id => gifts.find(gift => gift.id === id));
      } catch (error) {
        console.log("error", error);
        return false;
      }
    }

    return false;
  }

  disconnect() {
    this.websocket.disconnect();
  }

  streamend() {
    this.websocket.disconnect();
    this.emit("streamEnd", {});
  }

  handleWebcastResponse = response => {
    response.messages
      .filter(message => message.decodedData)
      .forEach(message => {
        let decodedMessage = handleMessageDecoding(message.decodedData);

        switch (message.type) {
          case "WebcastControlMessage":
            const action = message.decodedData.action;
            if ([3, 4].includes(action)) {
              this.shouldReconnect = false;
              this.emit(EVENTS.STREAMEND, { action });
              this.streamend();
            }
            break;
          case "WebcastRoomUserSeqMessage":
            this.emit(MESSAGE_TYPES.ROOMUSER, decodedMessage);
            break;
          case "WebcastChatMessage":
            this.emit(MESSAGE_TYPES.CHAT, decodedMessage);
            break;
          case "WebcastMemberMessage":
            this.emit(MESSAGE_TYPES.MEMBER, decodedMessage);
            break;
          case "WebcastGiftMessage":
            this.emit(MESSAGE_TYPES.GIFT, decodedMessage);
            break;
          case "WebcastSocialMessage":
            this.emit(MESSAGE_TYPES.SOCIAL, decodedMessage);
            
            if (decodedMessage.displayType?.includes("follow")) {
              this.emit(SOCIAL_TYPES.FOLLOW, decodedMessage);
            }
            
            if (decodedMessage.displayType?.includes("share")) {
              this.emit(SOCIAL_TYPES.SHARE, decodedMessage);
            }
            break;
          case "WebcastLikeMessage":
            this.emit(MESSAGE_TYPES.LIKE, decodedMessage);
            break;
          case "WebcastQuestionNewMessage":
            this.emit(MESSAGE_TYPES.QUESTIONNEW, decodedMessage);
            break;
          case "WebcastLinkMicBattle":
            this.emit(MESSAGE_TYPES.LINKMICBATTLE, decodedMessage);
            break;
          case "WebcastLinkMicArmies":
            this.emit(MESSAGE_TYPES.LINKMICARMIES, decodedMessage);
            break;
          case "WebcastLiveIntroMessage":
            this.emit(MESSAGE_TYPES.LIVEINTRO, decodedMessage);
            break;
          case "WebcastEmoteChatMessage":
            this.emit(MESSAGE_TYPES.EMOTE, decodedMessage);
            break;
          case "WebcastEnvelopeMessage":
            this.emit(MESSAGE_TYPES.ENVELOPE, decodedMessage);
            break;
          case "WebcastSubNotifyMessage":
            this.emit(MESSAGE_TYPES.SUBSCRIBE, decodedMessage);
            break;
        }
      });
  };
}

module.exports = ConexionTiktok;