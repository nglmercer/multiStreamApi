const WebSocket = require('ws');
const protobufjs = require('protobufjs');
const util = require('node:util');
const zlib = require('node:zlib');
const EventEmitter = require('events');
const querystring = require('querystring');
const url = require('url');
const crypto = require('crypto');

// Promisify zlib.unzip
const unzip = util.promisify(zlib.unzip);

// Constantes
const CONSTANTS = {
  WEBSOCKET_HOST: 'webcast16-ws-useast1a.tiktok.com',
  ORIGIN_URL: 'https://www.tiktok.com',
  PING_INTERVAL: 10000,
  SELECTED_COOKIE_NAMES: [
    'ttwid',
    'tt_chain_token',
    'odin_tt',
    'sid_guard',
    'uid_tt',
    'bm_sv'
  ],
  HEADERS: {
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive, Upgrade',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'websocket',
    'Sec-Fetch-Site': 'same-site',
    'Sec-WebSocket-Extensions': 'permessage-deflate',
    'Sec-WebSocket-Version': '13',
    'Upgrade': 'websocket',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
  },
  PROTO_MESSAGE_TYPES: {
    CONTROL: 'WebcastControlMessage',
    ROOM_USER_SEQ: 'WebcastRoomUserSeqMessage',
    CHAT: 'WebcastChatMessage',
    MEMBER: 'WebcastMemberMessage',
    GIFT: 'WebcastGiftMessage',
    SOCIAL: 'WebcastSocialMessage',
    LIKE: 'WebcastLikeMessage',
    QUESTION: 'WebcastQuestionNewMessage',
    LINK_MIC_BATTLE: 'WebcastLinkMicBattle',
    LINK_MIC_ARMIES: 'WebcastLinkMicArmies',
    LIVE_INTRO: 'WebcastLiveIntroMessage',
    EMOTE_CHAT: 'WebcastEmoteChatMessage',
    ENVELOPE: 'WebcastEnvelopeMessage',
    SUB_NOTIFY: 'WebcastSubNotifyMessage'
  }
};

// Singleton para el esquema de TikTok
class TikTokSchemaManager {
  constructor() {
    this.schema = null;
    this.schemaPath = require.resolve('./tiktokSchema.proto');
  }

  getSchema() {
    if (!this.schema) {
      this.schema = protobufjs.loadSync(this.schemaPath);
    }
    return this.schema;
  }
}

const schemaManager = new TikTokSchemaManager();

// Clase WebcastWebsocket
class WebcastWebsocket extends EventEmitter {
  constructor(wsUrl, cookieJar, clientParams, wsParams, customHeaders, websocketOptions) {
    super();
    this.pingInterval = null;
    this.connection = null;
    this.wsParams = { ...clientParams, ...wsParams };
    this.cookies = this._filterAndFormatCookies(cookieJar);
    this.wsHeaders = { ...customHeaders };
    this.websocketOptions = websocketOptions;
    this.wsUrlWithParams = this._formatWsUrl(wsUrl);
    
    this._connect();
  }

  _formatWsUrl(wsUrl) {
    const parsedUrl = url.parse(decodeURI(wsUrl));
    const queryParams = querystring.parse(parsedUrl.query);
    queryParams.browser_version = '5.0 (Windows)';
    const newQueryString = querystring.stringify(queryParams);
    
    return url.format({
      protocol: parsedUrl.protocol,
      host: parsedUrl.host,
      pathname: parsedUrl.pathname,
      search: `?${newQueryString}`
    });
  }

  _connect() {
    const headers = {
      ...CONSTANTS.HEADERS,
      ...this.wsHeaders,
      'Cookie': this.cookies,
      'Host': CONSTANTS.WEBSOCKET_HOST,
      'Origin': CONSTANTS.ORIGIN_URL,
      'Sec-WebSocket-Key': this._generateSecWebSocketKey()
    };

    this._cleanupExistingConnection();

    this.connection = new WebSocket(this.wsUrlWithParams, {
      headers: headers,
      ...this.websocketOptions
    });

    this._setupEventListeners();
  }

  _cleanupExistingConnection() {
    if (this.connection !== null) {
      try {
        this.connection.close();
      } catch (e) {
        // Silently handle close error
      }
      this.connection = null;
    }
  }

  _setupEventListeners() {
    this.connection.on('open', () => {
      this.emit('conectado', {});
      this.pingInterval = setInterval(() => this._sendPing(), CONSTANTS.PING_INTERVAL);
    });

    this.connection.on('message', (data) => {
      this._handleMessage(data);
    });

    this.connection.on('close', () => {
      clearInterval(this.pingInterval);
      this.emit("disconnected", {});
    });

    this.connection.on('error', (error) => {
      try {
        this.connection.close();
      } catch (e) {
        // Silently handle close error
      }
      this.emit('error', {});
      console.error('WebSocket error:', error);
    });
  }

  disconnect() {
    if (this.connection) {
      this.connection.close();
      clearInterval(this.pingInterval);
      this.connection = null;
    }
  }

  _filterAndFormatCookies(cookies) {
    return cookies
      .filter(cookie => CONSTANTS.SELECTED_COOKIE_NAMES.includes(cookie.name))
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }

  _generateSecWebSocketKey() {
    const array = new Uint8Array(16);
    crypto.randomFillSync(array);
    return Buffer.from(array).toString('base64');
  }
  
  _handleMessage(data) {
    if (data instanceof Buffer) {
      this._processBinaryMessage(data);
    }
  }

  async _processBinaryMessage(binaryData) {
    try {
      const decodedContainer = await deserializeWebsocketMessage(binaryData);
      if (decodedContainer.id > 0) {
        this._sendAck(decodedContainer.id);
      }

      if (typeof decodedContainer.webcastResponse === 'object') {
        this.emit('webcastResponse', decodedContainer.webcastResponse);
      }
    } catch (err) {
      this.emit('messageDecodingFailed', err);
    }
  }

  _sendPing() {
    if (this.connection && this.connection.readyState === WebSocket.OPEN) {
      this.connection.ping();
    }
  }

  _sendAck(id) {
    if (this.connection && this.connection.readyState === WebSocket.OPEN) {
      const ackMsg = serializeMessage('WebcastWebsocketAck', {
        type: 'ack',
        id
      });
      this.connection.send(ackMsg);
    }
  }
}

// Configuración global
const config = {
  skipMessageTypes: []
};

// Funciones para serialización/deserialización
async function deserializeWebsocketMessage(binaryMessage) {
  const decodedWebsocketMessage = deserializeMessage('WebcastWebsocketMessage', binaryMessage);
  
  if (decodedWebsocketMessage.type === 'msg') {
    let binary = decodedWebsocketMessage.binary;
    
    // Verificar si el mensaje está comprimido con gzip (firma mágica 0x1f8b08)
    if (binary && binary.length > 2 && binary[0] === 0x1f && binary[1] === 0x8b && binary[2] === 0x08) {
      decodedWebsocketMessage.binary = await unzip(binary);
    }
    
    decodedWebsocketMessage.webcastResponse = deserializeMessage('WebcastResponse', decodedWebsocketMessage.binary);
  }
  
  return decodedWebsocketMessage;
}

function deserializeMessage(protoName, binaryMessage) {
  const schema = schemaManager.getSchema();
  const webcastData = schema.lookupType(`TikTok.${protoName}`).decode(binaryMessage);
  
  if (protoName === 'WebcastResponse' && Array.isArray(webcastData.messages)) {
    webcastData.messages.forEach(message => {
      if (config.skipMessageTypes.includes(message.type)) return;
      
      const messageType = message.type;
      if (Object.values(CONSTANTS.PROTO_MESSAGE_TYPES).includes(messageType)) {
        message.decodedData = schema.lookupType(`TikTok.${messageType}`).decode(message.binary);
      }
    });
  }

  return webcastData;
}

function serializeMessage(protoName, obj) {
  const schema = schemaManager.getSchema();
  return schema.lookupType(`TikTok.${protoName}`).encode(obj).finish();
}

module.exports = WebcastWebsocket;