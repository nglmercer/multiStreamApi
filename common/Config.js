class Config{
  constructor() {
    process.env.PUERTO     = 322
    process.env.PUERTO_CV  = 320
    process.env.IP_REQUEST = "localhost:9001"
    process.env.IP_FIRMA   = "localhost:9001"
    process.env.IP_PAGO   = "localhost:9001"
    process.env.URL_SOCKET = 'https://localhost:9001'

  }
}

module.exports = Config