/**
 * Ripple Admin Console Configuration
 *
 * Copy this file to config.js and edit to suit your preferences.
 */
var Options = {
  // Rippled to connect
  server: {
    trace: false,
    trusted: true,
    local_signing: true,

    servers: [
      { host: 's-west.ripple.com', port: 443, secure: true },
      { host: 's-east.ripple.com', port: 443, secure: true }
    ]
  },

  api: {
    servers: ['wss://s-west.ripple.com:443', 'wss://s-east.ripple.com:443']
  },

  // Number of transactions each page has in balance tab notifications
  transactions_per_page: 50,

  // Number of ledgers ahead of the current ledger index where a tx is valid
  tx_last_ledger: 3,

  // Set max transaction fee for network in drops of XRP
  max_tx_network_fee: 200000,

  // Set max number of rows for orderbook
  orderbook_max_rows: 20,

  gateway_max_limit: 1000000000,

  // Should only be used for development purposes
  persistent_auth: false
};

Options.defaultServers = Options.server.servers;

// Load client-side overrides
if (store.enabled) {
  var settings = JSON.parse(store.get('ripple_settings') || '{}');

  if (settings.server && settings.server.servers) {
    var servers = _.filter(settings.server.servers, function(s) {
      return !s.isEmptyServer && _.isNumber(s.port) && !_.isNaN(s.port);
    });

    if (!servers.length) {
      servers = Options.servers;
    }

    Options.server = settings.server;
  }

  // The new ripple-lib API should use the same servers as the deprecated API
  Options.api.servers = _.map(Options.server.servers, function(server) {
    return 'wss://' + server.host + ':' + server.port;
  });

  if (settings.max_tx_network_fee) {
    Options.max_tx_network_fee = settings.max_tx_network_fee;
  }
}
