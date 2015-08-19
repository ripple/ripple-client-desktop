/**
 * Ripple trading default currency pairs.
 *
 * This list is a bit arbitrary, but it's basically the Majors [1] from forex
 * trading with some XRP pairs added.
 *
 * [1] http://en.wikipedia.org/wiki/Currency_pair#The_Majors
 */

var DEFAULT_PAIRS = [
  {name: 'BTC/XRP', last_used: 2},
  {name: 'XRP/USD', last_used: 2},
  {name: 'XRP/EUR', last_used: 2},
  {name: 'XRP/JPY', last_used: 1},
  {name: 'XRP/GBP', last_used: 1},
  {name: 'XRP/AUD', last_used: 0},
  {name: 'XRP/CHF', last_used: 0},
  {name: 'XRP/CAD', last_used: 0},
  {name: 'XRP/CNY', last_used: 0},
  {name: 'XRP/MXN', last_used: 0},
  {name: 'BTC/USD', last_used: 0},
  {name: 'BTC/EUR', last_used: 0},
  {name: 'EUR/USD', last_used: 0},
  {name: 'USD/JPY', last_used: 0},
  {name: 'GBP/USD', last_used: 0},
  {name: 'AUD/USD', last_used: 0},
  {name: 'USD/MXN', last_used: 0},
  {name: 'USD/CHF', last_used: 0}
];

module.exports = DEFAULT_PAIRS;