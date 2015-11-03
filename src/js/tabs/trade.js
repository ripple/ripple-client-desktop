var util = require('util');
var webutil = require('../util/web');
var settings = require('../util/settings');
var Tab = require('../client/tab').Tab;
var Amount = ripple.Amount;
var rewriter = require('../util/jsonrewriter');
var Currency = ripple.Currency;
var gateways = require('../../../deps/gateways.json');

var TradeTab = function ()
{
  Tab.call(this);
};

util.inherits(TradeTab, Tab);

TradeTab.prototype.tabName = 'trade';
TradeTab.prototype.mainMenu = 'trade';

TradeTab.prototype.generateHtml = function ()
{
  return require('../../templates/tabs/trade.jade')();
};

TradeTab.prototype.angularDeps = Tab.prototype.angularDeps.concat(['books']);

TradeTab.prototype.extraRoutes = [
  { name: '/trade/:first/:second' }
];

TradeTab.prototype.angular = function(module)
{
  module.controller('TradeCtrl', ['rpBooks', '$scope', 'rpId', 'rpNetwork',
                                  '$routeParams', '$location', '$filter',
                                  'rpKeychain', '$rootScope',
                                  function (books, $scope, id, $network,
                                            $routeParams, $location, $filter,
                                            keychain, $rootScope)
  {
    if (!id.loginStatus) id.goId();

    // Remember user preference on Convert vs. Trade
    $rootScope.ripple_exchange_selection_trade = true;

    // $scope.pairs_query = $scope.pairs_all;

    var currencyPairChangedByNonUser = false;

    $scope.first_currency_selected = '';
    $scope.second_currency_selected = '';
    $scope.currencies_all = require('../data/currencies');
    $scope.currencies = [];

    var widget = {
      first: '',
      price: '',
      second: '',
      mode: 'trade'
    };

    var OrderbookFilterOpts = {
      'precision':5,
      'min_precision':5,
      'max_sig_digits':20
    };

    for (var i = 0; i < $scope.currencies_all.length; i++) {
      if ($scope.currencies_all[i].custom_trade_currency_dropdown) {
        $scope.currencies.push($scope.currencies_all[i].value);
      }
    }

    function onBlobIsValid() {
      $scope.pairs_query = settings.getSetting($scope.userBlob, 'trade_currency_pairs');
      // Remember user preference on Convert vs. Trade
      if (!settings.getSetting($scope.userBlob, 'rippleExchangeSelectionTrade', false)) {
        $scope.userBlob.set('/clients/rippletradecom/rippleExchangeSelectionTrade', true);
      }
    }

    if (settings.blobIsValid($scope.userBlob)) {
      onBlobIsValid();
    } else {
      var removeListener = $scope.$on('$blobUpdate', function() {
        if (!settings.blobIsValid($scope.userBlob)) return;
        onBlobIsValid();
        removeListener();
      });
    }

    function update_pairs() {
      var d = $scope.userBlob.data;
      if (!settings.hasSetting($scope.userBlob, 'trade_currency_pairs')) {
        $scope.pairs_query = [{name: 'XRP/USD.rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q' },
          { name: 'XRP/USD.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B' },
          { name: 'XRP/JPY.r94s8px6kSw1uZ1MV98dhSRTvc6VMPoPcN' },
          { name: 'BTC.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B/XRP' },
          { name: 'BTC.rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q/XRP' }];
      }
      else {
        $scope.pairs_query = settings.getSetting($scope.userBlob, 'trade_currency_pairs');
      }
    }

    if ($scope.userBlob.data) {
      update_pairs();
    }

    $scope.$on('$blobUpdate', function() {
      update_pairs();
      resetIssuers(false);
    });


    $scope.reset = function () {
      $scope.executedOnOfferCreate = 'none';
      var pair = store.get('ripple_currency_pair') || $scope.pairs_all[0].name;

      // Decide which listing to show
      var listing;
      if ($scope.order) {
        listing = $scope.order.listing;
      }
      else if(store.get('ripple_listing')) {
        listing = store.get('ripple_listing');
      }
      else {
        listing = 'orderbook';
      }

      $scope.order = {
        currency_pair: pair,
        // These will be filled in by updateSettings
        //   first_currency
        //   second_currency
        first_issuer: null,
        second_issuer: null,
        listing: listing,

        buy: jQuery.extend(true, {}, widget),
        sell: jQuery.extend(true, {}, widget),

        // This variable is true if both the pair and the issuers are set to
        // valid values. It is used to enable or disable all the functionality
        // on the page.
        valid_settings: false
      };

      updateSettings();
      // updateMRU();
    };

    /**
     * Resets single order widget. Used to reset widgets after
     * the order confirmation.
     *
     * @param type (buy, sell)
     */
     /*
    $scope.reset_widget = function(type) {
      $scope.order[type] = jQuery.extend(true, {}, widget);

      updateSettings();
      // updateMRU();
    };
    */

    $scope.reset_widget = function(type, widgetOnly) {
      $scope.order[type] = jQuery.extend(true, {}, widget);

      if (widgetOnly) return;

      // Update widgets
      ['buy','sell'].forEach(function(type){
        $scope.update_first(type);
        $scope.update_price(type);
        $scope.update_second(type);
      });

      updateCanBuySell();
      //updateMRU();
    };


    /**
     * Sets current listing, and stores it in local storage.
     *
     * @param listing (my, orderbook)
     */
    $scope.setListing = function(listing){
      $scope.order.listing = listing;

      if (!store.disabled) {
        store.set('ripple_listing', listing);
      }
    };

    /**
     * Fill buy/sell widget when clicking on orderbook orders (sum or price)
     *
     * @param type (buy/sell)
     * @param order (order)
     * @param sum fill sum or not
     */
    $scope.fill_widget = function (type, order, sum) {
      $scope.reset_widget(type);

      $scope.order[type].price = order.price.to_human({group_sep: false});

      if (sum) {
        $scope.order[type].first = order.sum.to_human({group_sep: false});
        $scope.calc_second(type);
      }

    };

    /**
     * Happens when user clicks on "Place Order" button.
     *
     * @param type (buy, sell)
     */
    // TODO type is this....
    $scope.place_order = function (type) {
      $scope.order[type].mode = "confirm";

      if (type === 'buy') {
        $scope.order.buy.sell_amount = $scope.order.buy.second_amount;
        $scope.order.buy.buy_amount = $scope.order.buy.first_amount;
      } else {
        $scope.order.sell.sell_amount = $scope.order.sell.first_amount;
        $scope.order.sell.buy_amount = $scope.order.sell.second_amount;
      }

      $scope.fatFingerCheck(type);
    };

    /**
     * Returns orders currency pair, so we can compare it with current pair.
     */
    function getOrderCurrency(entry) {
      if (!entry) return '';
      var first_currency = entry.first.currency().to_json();
      var first_issuer = entry.first.issuer();
      var second_currency = entry.second.currency().to_json();
      var second_issuer = entry.second.issuer();

      var first = first_currency === 'XRP'
        ? 'XRP'
        : first_currency + '.' + first_issuer;

      var second = second_currency === 'XRP'
        ? 'XRP'
        : second_currency + '.' + second_issuer;

      var currency_pair = first + '/' + second;
      return currency_pair;
    }

    /**
     * Happens when user cliens the currency in "My Orders".
     */
    $scope.goto_order_currency = function() {
      if (!this.entry) return;
      if (getOrderCurrency(this.entry) === $scope.order.currency_pair) {
        // same pair, do nothing
        return;
      }

      var entry = this.entry;
      var order = $scope.order;
      currencyPairChangedByNonUser = true;
      order.first_currency = this.entry.first.currency().to_json();
      order.first_issuer = this.entry.first.issuer();
      order.second_currency = this.entry.second.currency().to_json();
      order.second_issuer = this.entry.second.issuer();

      var first = order.first_currency === 'XRP'
        ? 'XRP'
        : order.first_currency + '.' + order.first_issuer;

      var second = order.second_currency === 'XRP'
        ? 'XRP'
        : order.second_currency + '.' + order.second_issuer;

      order.currency_pair = first + '/' + second;

      var changedPair = updateSettings();
      // updateMRU();
      if (changedPair) {
        $scope.reset_widget('buy', true);
        $scope.reset_widget('sell', true);
      }
      return changedPair;
    }

    /**
     * Happens when user clicks on "Cancel" in "My Orders".
     */
    $scope.cancel_order = function() {
      var seq   = this.entry ? this.entry.seq : this.order.Sequence;
      var order = this;
      var tx    = $network.remote.transaction();
      var options = {
        account: id.account,
        offer_sequence: seq
      };

      $scope.cancelError = null;

      tx.offerCancel(options);
      tx.on('success', function() {
      });

      tx.on('error', function (err) {
        console.log("cancel error: ", err);

        order.cancelling   = false;
        $scope.cancelError = err.engine_result_message;

        if (!$scope.$$phase) {
          $scope.$apply();
        }
      });

      keychain.requestSecret(id.account, id.username, function (err, secret) {
        if (err) {

          //err should equal 'canceled' here, other errors are not passed through
          order.cancelling = false;
          return;
        }

        tx.secret(secret);
        tx.submit();
      });

      order.cancelling = true;
    };

    $scope.dismissCancelError = function() {
      $scope.cancelError = null;
    };

    /**
     * Happens when user clicks "Confirm" in order confirmation view.
     *
     * @param type (buy, sell)
     */
    $scope.order_confirmed = function (type)
    {
      var order = $scope.order[type];
      var tx = $network.remote.transaction();

      var options = {
        src: id.account,
        buy: order.buy_amount,
        sell: order.sell_amount
      };

      tx.offerCreate(options);

      // Add memo to tx
      tx.addMemo('client', 'rt' + $rootScope.version);

      // Sets a tfSell flag. This is the only way to distinguish
      // sell offers from buys.
      if (type === 'sell')
        tx.setFlags('Sell');

      tx.on('proposed', function (res) {

        setEngineStatus(res, false, type);

      });

      tx.on('success', function(res) {
        setEngineStatus(res, true, type);
        order.mode = "done";

        var tx = rewriter.processTxn(res, res.metadata, id.account);

        if (tx.effects) {
          for (var i = 0; i < tx.effects.length; i++) {
            var messageType = tx.effects[i].type;

            switch (messageType) {
              case 'trust_change_balance':
                $scope.executedOnOfferCreate = 'all';
                break;
              case 'offer_partially_funded':
                $scope.executedOnOfferCreate = 'partial';
                break;
              default:
                $scope.executedOnOfferCreate = 'none';
                break;
            }
          }
        }

        if (!$scope.$$phase) {
          $scope.$apply();
        }
      });

      tx.on('error', function (err) {
        setEngineStatus(err, false, type);
        order.mode = "done";

        if (!$scope.$$phase) {
          $scope.$apply();
        }
      });

      keychain.requestSecret(id.account, id.username, function (err, secret) {
        if (err) {

          //err should equal 'canceled' here, other errors are not passed through
          order.mode = 'trade';
          return;
        }

        tx.secret(secret);
        tx.submit();
      });

      order.mode = "sending";
    };

    $scope.loadMore = function () {
      $scope.orderbookLength = books.getLength();
      var multiplier = 30;

      Options.orderbook_max_rows += multiplier;

      loadOffers();

      $scope.orderbookState = (($scope.orderbookLength - Options.orderbook_max_rows + multiplier) < 1) ? 'full' : 'ready';
    }


    /**
     * Handle transaction result
     */
    function setEngineStatus(res, accepted, type) {
      var order = $scope.order[type];

      order.engine_result = res.engine_result;
      order.engine_result_message = res.engine_result_message;
      switch (res.engine_result.slice(0, 3)) {
        case 'tes':
          order.tx_result = accepted ? "cleared" : "pending";
          break;
        case 'tem':
          order.tx_result = "malformed";
          break;
        case 'ter':
          order.tx_result = "failed";
          break;
        case 'tec':
          order.tx_result = "claim";
          break;
        case 'tel':
          order.tx_result = "local";
          break;
        //case 'tep':
        default:
          order.tx_result = "unknown";
          console.warn("Unhandled engine status encountered:"+res.engine_result);
          break;
      }
    }

    $scope.update_first = function (type) {
      var order = $scope.order[type];
      var first_currency = $scope.order.first_currency || Currency.from_json("XRP");
      var formatted = "" + order.first + " " + (first_currency.has_interest() ? first_currency.to_hex() : first_currency.get_iso());

      order.first_amount = ripple.Amount.from_human(formatted, {reference_date: new Date(+new Date() + 5*60000)});

      if (!first_currency.is_native()) order.first_amount.set_issuer($scope.order.first_issuer);
    };

    $scope.update_price = function (type) {
      var order = $scope.order[type];
      var second_currency = $scope.order.second_currency || Currency.from_json("XRP");
      var formatted = "" + order.price + " " + (second_currency.has_interest() ? second_currency.to_hex() : second_currency.get_iso());

      order.price_amount = ripple.Amount.from_human(formatted, {reference_date: new Date(+new Date() + 5*60000)});

      if (!second_currency.is_native()) order.price_amount.set_issuer($scope.order.second_issuer);
    };

    $scope.update_second = function (type) {
      var order = $scope.order[type];
      var second_currency = $scope.order.second_currency || Currency.from_json("XRP");
      var formatted = "" + order.second + " " + (second_currency.has_interest() ? second_currency.to_hex() : second_currency.get_iso());

      order.second_amount = ripple.Amount.from_human(formatted, {reference_date: new Date(+new Date() + 5*60000)});

      if (!second_currency.is_native()) order.second_amount.set_issuer($scope.order.second_issuer);
    };

    $scope.fatFingerCheck = function(type) {
      // Skip the fat finger check if there's no book
      if (type === 'buy' && !$scope.book.bids[0]) return;
      else if (type === 'sell' && !$scope.book.asks[0]) return;

      var order = $scope.order[type];
      var fatFingerMarginMultiplier = 1.1;

      $scope.fatFingerErr = false;

      if (type === 'buy') {

        if (order.price > ($scope.book.bids[0].showPrice * fatFingerMarginMultiplier) ||
            order.price < ($scope.book.bids[0].showPrice / fatFingerMarginMultiplier)) {

          $scope.fatFingerErr = true;
        }
      }

      else if (type === 'sell') {

        if (order.price > ($scope.book.asks[0].showPrice * fatFingerMarginMultiplier) ||
            order.price < ($scope.book.asks[0].showPrice / fatFingerMarginMultiplier)) {

          $scope.fatFingerErr = true;
        }
      }
    }

    /**
     * Calculate second when first or price changes.
     *
     * @param type
     */
    $scope.calc_second = function (type) {
      var order = $scope.order[type];

      $scope.update_first(type);
      $scope.update_price(type);
      if (order.price_amount && order.price_amount.is_valid() &&
          order.first_amount && order.first_amount.is_valid()) {
        order.second_amount = order.price_amount.product_human(order.first_amount);
        order.second = order.second_amount.to_human({group_sep: false});
      }
    };

    /**
     * Calculate first when second changes.
     *
     * @param type
     */
    $scope.calc_first = function (type) {
      var order = $scope.order[type];

      $scope.update_second(type);
      $scope.update_price(type);
      if (order.price_amount  && order.price_amount.is_valid() &&
          order.second_amount && order.second_amount.is_valid()) {

        if (!order.price_amount.is_native()) {
          var price = order.price_amount.to_human({group_sep: false});
          var currency = order.price_amount.currency().to_json();
          var issuer = order.price_amount.issuer();

          // use replace(/,/g,'') until ripple lib fixed
          order.first_amount = Amount.from_json(order.second_amount.to_text_full().replace(/,/g, '')).ratio_human(Amount.from_json(price + '/' + currency + '/' + issuer), {reference_date: new Date()});
        } else {
          order.first_amount = Amount.from_json(order.second_amount.to_text_full().replace(/,/g, '')).ratio_human(Amount.from_json(order.price_amount.to_text()), {reference_date: new Date()});
        }
        order.first = order.first_amount.to_human({group_sep: false});
      }
    };
    $scope.flip_issuer = function () {
      var order = $scope.order;
      if (!order.valid_settings) return;
      var currency = order['first_currency'];
      var issuer = order['first_issuer'];
      var pair = order['currency_pair'].split('/');
      currencyPairChangedByNonUser = true;
      order['first_currency'] = order['second_currency'];
      order['first_issuer'] = order['second_issuer'];
      order['second_currency'] = currency;
      order['second_issuer'] = issuer;
      order['currency_pair'] = pair[1] + '/' + pair[0];
      updateSettings();
      updateMRU();
    }

    // This functions is called whenever the settings, specifically the pair and
    // the issuer(s) have been modified. It checks the new configuration and
    // sets $scope.valid_settings.
    function updateSettings() {
      var order = $scope.order;
      var pair = order.currency_pair;

      if (!store.disabled) {
        store.set('ripple_currency_pair', pair);
      }

      if ("string" !== typeof pair) pair = "";
      pair = pair.split('/');

      // Invalid currency pair
      if (pair.length != 2 || pair[0].length === 0 || pair[1].length === 0) {
        order.first_currency = Currency.from_json('XRP');
        order.second_currency = Currency.from_json('XRP');
        order.valid_settings = false;
        return;
      }


      var first_currency = order.first_currency = ripple.Currency.from_json(pair[0].substring(0,3));
      var second_currency = order.second_currency = ripple.Currency.from_json(pair[1].substring(0,3));

      if(first_currency.is_native()) {
        order.first_issuer = '';
      } else {
        var contact_to_address1 = webutil.resolveContact($scope.userBlob.data.contacts, pair[0].substring(4));
        if (contact_to_address1) {
          order.first_issuer = contact_to_address1;
        } else {
          order.first_issuer = pair[0].substring(4);
        }
      }

      if(second_currency.is_native()) {
        order.second_issuer = '';
      } else {
        var contact_to_address2 = webutil.resolveContact($scope.userBlob.data.contacts, pair[1].substring(4));
        if (contact_to_address2) {
          order.second_issuer = contact_to_address2;
        } else {
          order.second_issuer = pair[1].substring(4);
        }
      }

      // Invalid issuers or XRP/XRP pair
      if ((!first_currency.is_native() && !RippleAddressCodec.isValidAddress(order.first_issuer)) ||
          (!second_currency.is_native() && !RippleAddressCodec.isValidAddress(order.second_issuer)) ||
          (first_currency.is_native() && second_currency.is_native())) {
        order.valid_settings = false;
        return;
      }

      order.valid_settings = true;

      // Remember pair
      // Produces currency/issuer:currency/issuer
      var key = "" +
        order.first_currency.to_json() +
        (order.first_currency.is_native() ? "" : "/" + order.first_issuer) +
        ":" +
        order.second_currency._iso_code +
        (order.second_currency.is_native() ? "" : "/" + order.second_issuer);

      var changedPair = false;
      // Load orderbook
      if (order.prev_settings !== key) {
        changedPair = true;
        $scope.priceTicker = {
          bid: 'n/a',
          ask: 'n/a',
          spread: 'n/a'
        };
        loadOffers();

        order.prev_settings = key;
      }

      // Update widgets
      ['buy','sell'].forEach(function(type){
        $scope.update_first(type);
        $scope.update_price(type);
        $scope.update_second(type);
      });

      updateCanBuySell();
      return changedPair;
    }

    // This functions is called after the settings have been modified. 
    // It updates the most recent used pairs dropdown.
    function updateMRU() {
      var order = $scope.order;
      if (!order.valid_settings) return;
      if (!order.first_currency || !order.second_currency) return;
      if (!order.first_currency.is_valid() || !order.second_currency.is_valid()) return;
      var canonical_name = order.first_currency.to_json() + "/" + order.second_currency.to_json();

      // Remember currency pair and set last used time
      var found = false;
      for (var i = 0; i < $scope.pairs_all.length; i++) {
        if ($scope.pairs_all[i].name.toLowerCase() == canonical_name.toLowerCase()) {
          var pair_obj = $scope.pairs_all[i];
          pair_obj.name = canonical_name;
          pair_obj.last_used = new Date().getTime();
          $scope.pairs_all.splice(i, 1);
          $scope.pairs_all.unshift(pair_obj);
          found = true;
          break;
        }
      }

      if (!found) {
        $scope.pairs_all.unshift({
          "name": canonical_name,
          "last_used": new Date().getTime()
        });
      }

      if (!$scope.$$phase) {
        $scope.$apply();
      }
    }

    /**
     * Tries to guess an issuer based on user's preferred issuer or highest trust.
     *
     * @param currency
     * @param exclude_issuer
     * @returns issuer
     */
    function guessIssuer(currency, exclude_issuer) {
      var guess;

      // First guess: An explicit issuer preference setting in the user's blob
      try {
        guess = $scope.userBlob.data.preferred_issuer[currency];
        if (guess && guess === exclude_issuer) {
          guess = $scope.userBlob.data.preferred_second_issuer[currency];
        }
        if (guess) return guess;
      } catch (e) {}

      // Second guess: The user's highest trust line in this currency
      try {
        var issuers = $scope.balances[currency].components;
        for (var counterparty in issuers) {
          if (counterparty != exclude_issuer) {
            return counterparty;
          }
        }
      } catch (e) {}

      // We found nothing
      return null;
    }

    function resetIssuers(force) {
      var guess;
      var order = $scope.order;

      if (force) {
        order.first_issuer = null;
        order.second_issuer = null;
      }

      ['first','second'].forEach(function(prefix){
        if (!order[prefix + '_issuer'] &&
            order[prefix + '_currency'] &&
            order[prefix + '_currency'] !== 'XRP' &&
            (guess = guessIssuer(order[prefix + '_currency'].to_json()))) {
          order[prefix + '_issuer'] = guess;
        }
      });

      // If the same currency, exclude first issuer for second issuer guess
      if (order.first_currency.equals(order.second_currency) &&
          order.first_issuer === order.second_issuer &&
          (guess = guessIssuer(order.first_currency.to_json(), order.first_issuer))) {
        order.second_issuer = guess;
      }
    }

    /**
     * $scope.first_issuer_edit
     * $scope.first_issuer_save
     * $scope.second_issuer_edit
     * $scope.second_issuer_save
     */
    ['first','second'].forEach(function(prefix){
      $scope['edit_' + prefix + '_issuer'] = function () {
        $scope.show_issuer_form = prefix;
        $scope.order[prefix + '_issuer_edit'] = webutil.unresolveContact($scope.userBlob.data.contacts, $scope.order[prefix + '_issuer']);

        setImmediate(function () {
          $('#' + prefix + '_issuer').select();
        });
      };

      $scope['save_' + prefix + '_issuer'] = function () {
        $scope.order[prefix + '_issuer'] = webutil.resolveContact($scope.userBlob.data.contacts, $scope.order[prefix + '_issuer_edit']);
        $scope.show_issuer_form = false;

        updateSettings();
        updateMRU();

        // Persist issuer setting
        if ($scope.order.valid_settings && !$scope.order[prefix + '_currency'].is_native()) {
          if (prefix === 'first') {
            $scope.userBlob.set("/preferred_issuer/"+
                                $scope.userBlob.escapeToken($scope.order.first_currency.to_json()),
                                $scope.order['first_issuer']);
          } else {
            if ($scope.order.first_currency.equals($scope.order.second_currency)) {
              $scope.userBlob.set("/preferred_second_issuer/"+
                                  $scope.userBlob.escapeToken($scope.order.second_currency.to_json()),
                                  $scope.order.second_issuer);
            } else {
              $scope.userBlob.set("/preferred_issuer/"+
                                  $scope.userBlob.escapeToken($scope.order.second_currency.to_json()),
                                  $scope.order.second_issuer);
            }
          }
        }
      };
    });

    /**
     * Load orderbook
     */
    function loadOffers() {
      if ($scope.readOnly) return;

      // Make sure we unsubscribe from any previously loaded orderbook
      if ($scope.book && "function" === typeof $scope.book.unsubscribe) {
        $scope.book.unsubscribe();
      }

      $scope.book = books.get({
        currency: ($scope.order.first_currency.has_interest() ? $scope.order.first_currency.to_hex() : $scope.order.first_currency.get_iso()),
        issuer: $scope.order.first_issuer
      }, {
        currency: ($scope.order.second_currency.has_interest() ? $scope.order.second_currency.to_hex() : $scope.order.second_currency.get_iso()),
        issuer: $scope.order.second_issuer
      });

      $scope.orderbookState = 'ready';
    }

    /**
     * Determine whether user can sell and/or buy on this pair
     */
    var updateCanBuySell = function () {
      var first_currency = $scope.order.first_currency;
      var first_issuer = $scope.order.first_issuer;
      var second_currency = $scope.order.second_currency;
      var second_issuer = $scope.order.second_issuer;

      var canBuy = second_currency.is_native() ||
          second_issuer == $scope.address ||
          ($scope.lines[second_issuer+($scope.order.second_currency.has_interest() ? $scope.order.second_currency.to_hex() : $scope.order.second_currency.to_json())]
            && $scope.lines[second_issuer+($scope.order.second_currency.has_interest() ? $scope.order.second_currency.to_hex() : $scope.order.second_currency.to_json())].balance.is_positive());


      var canSell = first_currency.is_native() ||
          first_issuer == $scope.address ||
          ($scope.lines[first_issuer+($scope.order.first_currency.has_interest() ? $scope.order.first_currency.to_hex() : $scope.order.first_currency.to_json())]
            && $scope.lines[first_issuer+($scope.order.first_currency.has_interest() ? $scope.order.first_currency.to_hex() : $scope.order.first_currency.to_json())].balance.is_positive());

      $scope.order.buy.showWidget = canBuy;
      $scope.order.sell.showWidget = canSell;
    };

    $scope.$watch('first_currency_selected', function() {
      $scope.first_issuer_selected = '';
      if($scope.first_currency_selected == 'XRP') {
        $scope.gateway_change_form.first_iss.$setValidity('rpDest', true);
        $scope.disable_first_issuer = true;
      }
      else {
        $scope.disable_first_issuer = false;
        $scope.first_iss = {};
        gateways.forEach(function(gateway) {
          //$scope.first_iss[gateway.name] = gateway;
          var accounts = gateway.accounts;
          accounts.forEach(function(account){
            account.currencies.forEach(function(currency){
              if(currency === $scope.first_currency_selected){
                // $scope.first_iss[gateway.name] = gateway;
                $scope.first_iss[account.address] = { name: account.address };
              }
            });
          });
        });
      }
    });

    $scope.$watch('second_currency_selected', function () {
      $scope.second_issuer_selected = '';
      if($scope.second_currency_selected == 'XRP') {
        $scope.gateway_change_form.second_iss.$setValidity('rpDest', true);
        $scope.disable_second_issuer = true;
      }
      else {
        $scope.disable_second_issuer = false;
        $scope.second_iss = {};
        gateways.forEach(function(gateway) {
          //$scope.second_iss[gateway.name] = gateway;
          var accounts = gateway.accounts;
          accounts.forEach(function(account){
            account.currencies.forEach(function(currency){
              if(currency === $scope.second_currency_selected){
                // $scope.second_iss[gateway.name] = gateway;
                $scope.second_iss[account.address] = { name: account.address };
              }
            });
          });
        });
      }
    });

    $scope.gotoSettings = function() {
      $location.path('/settingstrade');
    };

    $scope.open_custom_currency_selector = function() {
      $scope.first_currency_selected = '';
      $scope.first_issuer_selected = '';
      $scope.second_currency_selected = '';
      $scope.second_issuer_selected = '';
      $scope.adding_pair = true;
    }

    $scope.add_pair = function() {
      var formattedIssuerFirst = $scope.first_currency_selected === 'XRP' ? '' : '.' + $scope.first_issuer_selected;
      var formattedIssuerSecond = $scope.second_currency_selected === 'XRP' ? '' : '.' + $scope.second_issuer_selected;
      if (($scope.second_currency_selected !== 'XRP' && ($scope.second_issuer_selected == null || $scope.second_issuer_selected === '')) ||
          ($scope.first_currency_selected  !== 'XRP' && ($scope.first_issuer_selected  == null || $scope.first_issuer_selected  === ''))) {
        // this could happen if gate is not validated
        return;
      }

      $scope.order.currency_pair = $scope.first_currency_selected + formattedIssuerFirst + '/' + $scope.second_currency_selected + formattedIssuerSecond;

      // var data = $scope.userBlob.data;
      // if (!data.clients || !data.clients.rippletradecom ||
      //     !data.clients.rippletradecom.trade_currency_pairs ||
      //     !angular.isArray(data.clients.rippletradecom.trade_currency_pairs)) {
      // } else {
        $scope.userBlob.unshift('/clients/rippletradecom/trade_currency_pairs', { name: $scope.order.currency_pair });
      // }
      

      $scope.adding_pair = false;
    };


    var rpamountFilter = $filter('rpamount');

    $scope.$watchCollection('book', function () {
      if (!jQuery.isEmptyObject($scope.book)) {
        ['asks','bids'].forEach(function(type){
          if ($scope.book[type]) {
            $scope.book[type].forEach(function(order){
              order.showSum = rpamountFilter(order.sum,OrderbookFilterOpts);
              order.showPrice = rpamountFilter(order.price,OrderbookFilterOpts);

              var showValue = type === 'bids' ? 'TakerPays' : 'TakerGets';
              order['show' + showValue] = rpamountFilter(order[showValue],OrderbookFilterOpts);
            });
          }
        });
      }
    });

    /**
     * Watch widget field changes
     */
    ['buy','sell'].forEach(function(type){
      $scope.$watch('order.' + type + '.first', function () {
        $scope.update_first(type);
      }, true);

      $scope.$watch('order.' + type + '.price', function () {
        $scope.update_price(type);
      }, true);

      $scope.$watch('order.' + type + '.second', function () {
        $scope.update_second(type);
      }, true);
    });

    $scope.$watch('order.currency_pair', function (pair) {
      if (currencyPairChangedByNonUser) {
        currencyPairChangedByNonUser = false;
        return;
      }

      $scope.reset_widget('buy', true);
      $scope.reset_widget('sell', true);

      updateSettings();
      resetIssuers(true);
      // updateMRU();
    }, true);

    $scope.$on('$blobUpdate', function () {
      resetIssuers(false);
    });


    $scope.$watch('order.type', function () {
      updateCanBuySell();
    });

    $scope.$watch('order.first_issuer', function () {
      updateSettings();
      // updateMRU();
    });

    $scope.$watch('order.second_issuer', function () {
      updateSettings();
      // updateMRU();
    });

    var updateBalances = function(){
      updateCanBuySell();
      resetIssuers(false);
    };

    $scope.$on('$balancesUpdate', updateBalances);

    $scope.$watch('userBlob.data.contacts', function (contacts) {
      $scope.issuer_query = webutil.queryFromContacts(contacts);
    }, true);

    $scope.$watchCollection('offers', function(){
      $scope.offersCount = _.size($scope.offers);
    });

    $scope.reset();

    /**
     * Route includes currency pair
     */
    if ($routeParams.first && $routeParams.second) {
      var routeIssuers = {};
      var routeCurrencies = {};

      ['first','second'].forEach(function(prefix){
        routeIssuers[prefix] = $routeParams[prefix].match(/:(.+)$/);
        routeCurrencies[prefix] = $routeParams[prefix].match(/^(\w{3})/);

        if (routeIssuers[prefix]) {
          if (RippleAddressCodec.isValidAddress(routeIssuers[prefix][1])) {
            $scope.order[prefix + '_issuer'] = routeIssuers[prefix][1];
          } else {
            $location.path('/trade');
          }
        }
      });

      if (routeCurrencies['first'] && routeCurrencies['second']) {
        if (routeCurrencies['first'][1] !== routeCurrencies['second'][1]) {
          $scope.order.currency_pair = routeCurrencies['first'][1] + '/' + routeCurrencies['second'][1];
        } else {
          $location.path('/trade');
        }
      }

      updateSettings();
      updateMRU();
    }

    updateBalances();

    // Unsubscribe from the book when leaving this page
    $scope.$on('$destroy', function(){
      if ($scope.book && "function" === typeof $scope.book.unsubscribe) {
        $scope.book.unsubscribe();
      }
    });
  }]);
};

module.exports = TradeTab;