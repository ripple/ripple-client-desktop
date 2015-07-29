/**
 * Ripple Client Configuration
 *
 * Copy this file to config.js and edit to suit your preferences.
 */
var Options = {
  domain: 'rippletrade.com',
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

  // Number of transactions each page has in balance tab notifications
  transactions_per_page: 50,

  // Number of ledgers ahead of the current ledger index where a tx is valid
  tx_last_ledger: 3,

  // Set max transaction fee for network in drops of XRP
  max_tx_network_fee: 200000,

  // Set max number of rows for orderbook
  orderbook_max_rows: 20,

  advanced_feature_switch: false,

  gateway_max_limit: 1000000000
};

Options.defaultServers = Options.server.servers;

// Load client-side overrides
if (store.enabled) {
  var settings = JSON.parse(store.get('ripple_settings') || '{}');

  if (settings.server && settings.server.servers) {
    Options.server.servers = _.filter(settings.server.servers, function(s) {
      return !s.isEmptyServer && _.isNumber(s.port) && !_.isNaN(s.port);
    });
  }

  if (settings.advanced_feature_switch) {
    Options.advanced_feature_switch = settings.advanced_feature_switch;
  }

  if (settings.max_tx_network_fee) {
    Options.max_tx_network_fee = settings.max_tx_network_fee;
  }
}
