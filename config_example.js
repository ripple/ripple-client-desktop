/**
 * Ripple Admin Console Configuration
 *
 * Copy this file to config.js and edit to suit your preferences.
 */
var Options = {
  // Rippled to connect
  connection: {
    trace: false,
    trusted: true,
    local_signing: true,

    servers: [
      { host: 's-west.ripple.com', port: 443, secure: true },
      { host: 's-east.ripple.com', port: 443, secure: true }
    ]
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

// Load client-side overrides
if (store.enabled) {
  var settings = JSON.parse(store.get('ripple_settings') || '{}');

  if (settings.connection && settings.connection.servers) {
    var servers = _.filter(settings.connection.servers, function(s) {
      return !s.isEmptyServer && _.isNumber(s.port) && !_.isNaN(s.port);
    });

    if (!servers.length) {
      servers = Options.connection.servers;
    }
    settings.connection.servers = servers;

    Options.connection = settings.connection;
  }

  if (settings.max_tx_network_fee) {
    Options.max_tx_network_fee = settings.max_tx_network_fee;
  }
}
