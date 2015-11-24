/**
 * APP
 *
 * The app controller manages the global scope.
 */

var rewriter = require('../util/jsonrewriter'),
  genericUtils = require('../util/generic'),
  Amount = ripple.Amount,
  RippleAddress = require('../util/types').RippleAddress,
  fs = require('fs');

var module = angular.module('app', []);

module.controller('AppCtrl', ['$rootScope', '$compile', 'rpId', 'rpNetwork',
                              'rpKeychain', '$route', '$timeout', 'rpFileDialog',
                              function ($scope, $compile, $id, $net,
                                        keychain, $route, $timeout, fileDialog)
{
  reset();

  var account;

  // Global sequence variable to be incremented after every transaction
  $scope.$watch('userBlob', function() {
    if ($scope.userBlob.data && $scope.userCredentials.username) {
      if (!$scope.userBlob.data.sequence) {
        $scope.userBlob.set('/sequence', 1);
      }
      if (!$scope.userBlob.data.fee) {
        $scope.userBlob.set('/fee', 200000);
      }
      if (!$scope.userBlob.data.defaultDirectory) {
        $scope.userBlob.set('/defaultDirectory', '');
      }
      $scope.sequence = $scope.userBlob.data.sequence;
      $scope.fee = $scope.userBlob.data.fee;
      $scope.defaultDirectory = $scope.userBlob.data.defaultDirectory;
    }
  });

  $scope.incrementSequence = function() {
    $scope.sequence++;
    $scope.userBlob.set('/sequence', $scope.sequence);
  }

  // TODO make this wallet specific
  $scope.onlineMode = !!store.get('onlineMode');

  // Remember the onlineMode switch value and handle the connection
  $scope.switchOnlineMode = function(){
    $scope.onlineMode = !$scope.onlineMode;
    $scope.onlineMode ? $net.connect() : $net.disconnect();
    store.set('onlineMode', $scope.onlineMode);
  };

  // For announcement banner
  $scope.showAnnouncement = store.get('announcement');

  if('undefined' === typeof $scope.showAnnouncement) $scope.showAnnouncement = true;

  $scope.dismissBanner = function() {
    store.set('announcement', false);
    $scope.showAnnouncement = store.get('announcement');
  }

  // Set default directory if it has not already been set
  $scope.fileInputClick = function(txnName, txData) {
    fileDialog.openDir(function(evt) {
      $scope.$apply(function() {
        $scope.defaultDirectory = evt;
        $scope.$watch('userBlob', function() {
          if ($scope.userBlob.data && $scope.userCredentials.username) {
            $scope.userBlob.set('/defaultDirectory', evt);
            if ($scope.defaultDirectory) {
              $scope.saveToDisk(txnName, txData);
            }
          }
        });
      });
    });
  };

  $scope.saveToDisk = function(txnName, txData) {
    var fileName = $scope.userBlob.data.defaultDirectory + '/' + txnName;
    fs.writeFile(fileName, txData, function(err) {
      $scope.$apply(function() {
        $scope.fileName = fileName;
        if (err) {
          console.log('Error saving transaction: ', JSON.stringify(err));
          $scope.error = true;
        } else {
          console.log('saved file');
          $scope.saved = true;
        }
      });
      // Reset root scope vars so messages do not persist accross controllers
      setTimeout(function() {
        $scope.error = $scope.saved = undefined;
      }, 1000);
    });
  };

  // Global reference for debugging only (!)
  if ("object" === typeof rippleclient) {
    rippleclient.id = $id;
    rippleclient.net = $net;
    rippleclient.keychain = keychain;
  }

  function reset()
  {
    $scope.defaultDirectory = '';
    $scope.account = {};
    $scope.lines = {};
    $scope.offers = {};
    $scope.events = [];
    $scope.history = [];
    $scope.balances = {};
    $scope.loadState = [];
    $scope.unseenNotifications = {
      count: 0
    };
  }

  // Load notification modal
  $scope.load_notification = function(status) {
    if (typeof status !== 'string') {
      console.log("You must pass in a string for the status");
      return;
    }

    $scope.notif = status;

    $timeout(function() {
      $scope.notif = "clear";
    }, 7000);
  }

  // TODO fix this
  $scope.reset = function(){
    reset();
  }

  var myHandleAccountEvent;
  var myHandleAccountEntry;

  function handleAccountLoad(e, data)
  {
    var remote = $net.remote;

    // If user logs in with regular key wallet
    // check to see if wallet is still valid
    remote.requestAccountInfo({
      account: data.account
    }, function(accountError, accountInfo) {
      var invalidRegularWallet = false;
      if (accountError) {
        // Consider wallet valid
        console.log('Error getting account data: ', accountError);
      } else if ($scope.userBlob.data.regularKey && !$scope.userBlob.data.masterkey) {
        // If we are using a regular wallet file (no masterkey)
        // check to see if regular key is valid
        var regularKeyPublic = new RippleAddress($scope.userBlob.data.regularKey).getAddress();
        if (regularKeyPublic !== accountInfo.account_data.RegularKey) {
          invalidRegularWallet = true;
        }
      }
      $scope.invalidRegularWallet = invalidRegularWallet;
    });

    account = data.account;

    reset();

    var accountObj = remote.account(data.account);

    // We need a reference to these functions after they're bound, so we can
    // unregister them if the account is unloaded.
    myHandleAccountEvent = handleAccountEvent;
    myHandleAccountEntry = handleAccountEntry;
    $scope.loadingAccount = true;

    accountObj.on('transaction', myHandleAccountEvent);
    accountObj.on('entry', function(data){
      $scope.$apply(function () {
        $scope.loadingAccount = false;
        myHandleAccountEntry(data);
      });
    });

    accountObj.entry(function (err, entry) {
      if (err) {
        $scope.loadingAccount = false;
        $scope.loadState['account'] = true;
      }
    });

    // Ripple credit lines
    remote.requestAccountLines({account: data.account})
      .on('success', handleRippleLines)
      .on('error', handleRippleLinesError).request();

    // Transactions
    remote.requestAccountTransactions({
      account: data.account,
      ledger_index_min: -1,
      descending: true,
      limit: Options.transactions_per_page,
      binary: false
    })
      .on('transactions', handleAccountTx)
      .on('error', handleAccountTxError).request();

    // Outstanding offers
    remote.requestAccountOffers({ account: data.account})
      .on('success', handleOffers)
      .on('error', handleOffersError).request();
  }

  function handleAccountUnload(e, data)
  {
    if (myHandleAccountEvent && myHandleAccountEntry) {
      var remote = $net.remote;
      var accountObj = remote.account(data.account);
      accountObj.removeListener('transaction', myHandleAccountEvent);
      accountObj.removeListener('entry', myHandleAccountEntry);
    }
  }

  function handleRippleLines(data)
  {
    $scope.$apply(function () {
      $scope.lines = {};

      for (var n=0, l=data.lines.length; n<l; n++) {
        var line = data.lines[n];

        // XXX: This reinterpretation of the server response should be in the
        //      library upstream.
        line = $.extend({}, line, {
          limit: ripple.Amount.from_json({value: line.limit, currency: line.currency, issuer: line.account}),
          limit_peer: ripple.Amount.from_json({value: line.limit_peer, currency: line.currency, issuer: account}),
          balance: ripple.Amount.from_json({value: line.balance, currency: line.currency, issuer: account})
        });

        $scope.lines[line.account+line.currency] = line;
        updateRippleBalance(line.currency, line.account, line.balance);
      }
      console.log('lines updated:', $scope.lines);

      $scope.$broadcast('$balancesUpdate');

      $scope.loadState['lines'] = true;
    });
  }

  function handleRippleLinesError(data)
  {
    $scope.$apply(function () {
      $scope.loadState['lines'] = true;
    });
  }

  function handleOffers(data)
  {
    $scope.$apply(function () {
      data.offers.forEach(function (offerData) {
        var offer = {
          seq: +offerData.seq,
          gets: ripple.Amount.from_json(offerData.taker_gets),
          pays: ripple.Amount.from_json(offerData.taker_pays),
          flags: offerData.flags
        };

        updateOffer(offer);
      });
      console.log('offers updated:', $scope.offers);
      $scope.$broadcast('$offersUpdate');

      $scope.loadState['offers'] = true;
    });
  }

  function handleOffersError(data)
  {
    $scope.$apply(function () {
      $scope.loadState['offers'] = true;
    });
  }

  function handleAccountEntry(data)
  {
    var remote = $net.remote;

    // Only overwrite account data if the new data has a bigger sequence number (is a newer information)
    if ($scope.account && $scope.account.Sequence && $scope.account.Sequence >= data.Sequence) {
      return;
    }

    $scope.account = data;

    // XXX Shouldn't be using private methods
    var server = remote._getServer();

    // As per json wire format convention, real ledger entries are CamelCase,
    // e.g. OwnerCount, additional convenience fields are lower case, e.g.
    // reserve, max_spend.
    var ownerCount  = $scope.account.OwnerCount || 0;
    $scope.account.reserve_base = server._reserve(0);
    $scope.account.reserve = server._reserve(ownerCount);
    $scope.account.reserve_to_add_trust = server._reserve(ownerCount+1);
    $scope.account.reserve_low_balance = $scope.account.reserve.product_human(2);

    // Maximum amount user can spend
    var bal = Amount.from_json(data.Balance);
    $scope.account.max_spend = bal.subtract($scope.account.reserve);

    $scope.loadState['account'] = true;
  }

  function handleAccountTx(data)
  {
    $scope.$apply(function () {
      $scope.tx_marker = data.marker;

      if (data.transactions) {
        data.transactions.reverse().forEach(function (e, key) {
          processTxn(e.tx, e.meta, true);
        });

        $scope.$broadcast('$eventsUpdate');
      }

      $scope.loadState['transactions'] = true;
    });
  }

  function handleAccountTxError(data)
  {
    $scope.$apply(function () {
      $scope.loadState['transactions'] = true;
    });
  }

  function handleAccountEvent(e)
  {
    $scope.$apply(function () {
      processTxn(e.transaction, e.meta);
      $scope.$broadcast('$eventsUpdate');
    });
  }

  /**
   * Process a transaction and add it to the history table.
   */
  function processTxn(tx, meta, is_historic)
  {
    var processedTxn = rewriter.processTxn(tx, meta, account);

    if (processedTxn && processedTxn.error) {
      var err = processedTxn.error;
      console.error('Error processing transaction '+processedTxn.transaction.hash+'\n',
                    err && 'object' === typeof err && err.stack ? err.stack : err);

      // Add to history only
      $scope.history.unshift(processedTxn);
    } else if (processedTxn) {
      var transaction = processedTxn.transaction;

      // Update account
      if (processedTxn.accountRoot) {
        handleAccountEntry(processedTxn.accountRoot);
      }

      // Show status notification
      if (processedTxn.tx_result === "tesSUCCESS" &&
          transaction &&
          !is_historic) {

        $scope.$broadcast('$appTxNotification', {
          hash:tx.hash,
          tx: transaction
        });
      }

      // Add to recent notifications
      if (processedTxn.tx_result === "tesSUCCESS" &&
          transaction) {

        var effects = [];
        // Only show specific transactions
        switch (transaction.type) {
          case 'offernew':
          case 'exchange':
            var funded = false;
            processedTxn.effects.some(function(effect) {
              if (_.includes(['offer_bought','offer_funded','offer_partially_funded'], effect.type)) {
                funded = true;
                effects.push(effect);
                return true;
              }
            });

            // Only show trades/exchanges which are at least partially funded
            if (!funded) {
              break;
            }
            /* falls through */
          case 'received':

            // Is it unseen?
            if (processedTxn.date > ($scope.userBlob.data.lastSeenTxDate || 0)) {
              processedTxn.unseen = true;
              $scope.unseenNotifications.count++;
            }

            processedTxn.showEffects = effects;
            $scope.events.unshift(processedTxn);
        }
      }

      // Add to history
      $scope.history.unshift(processedTxn);

      // Update Ripple lines
      if (processedTxn.effects && !is_historic) {
        updateLines(processedTxn.effects);
      }

      // Update my offers
      if (processedTxn.effects && !is_historic) {
        // Iterate on each effect to find offers
        processedTxn.effects.forEach(function (effect) {
          // Only these types are offers
          if (_.includes([
            'offer_created',
            'offer_funded',
            'offer_partially_funded',
            'offer_cancelled'], effect.type))
          {
            var offer = {
              seq: +effect.seq,
              gets: effect.gets,
              pays: effect.pays,
              deleted: effect.deleted,
              flags: effect.flags
            };

            updateOffer(offer);
          }
        });

        $scope.$broadcast('$offersUpdate');
      }
    }
  }

  function updateOffer(offer)
  {
    if (offer.flags && offer.flags === ripple.Remote.flags.offer.Sell) {
      offer.type = 'sell';
      offer.first = offer.gets;
      offer.second = offer.pays;
    } else {
      offer.type = 'buy';
      offer.first = offer.pays;
      offer.second = offer.gets;
    }

    if (!offer.deleted) {
      $scope.offers[""+offer.seq] = offer;
    } else {
      delete $scope.offers[""+offer.seq];
    }
  }

  function updateLines(effects)
  {
    if (!$.isArray(effects)) return;

    var balancesUpdated;

    $.each(effects, function () {
      if (_.includes([
        'trust_create_local',
        'trust_create_remote',
        'trust_change_local',
        'trust_change_remote',
        'trust_change_balance',
        'trust_change_flags'], this.type))
      {
        var effect = this,
            line = {},
            index = effect.counterparty + effect.currency;

        line.currency = effect.currency;
        line.account = effect.counterparty;
        line.flags = effect.flags;
        line.no_ripple = !!effect.noRipple; // Force Boolean
        line.freeze = !!effect.freeze; // Force Boolean
        line.authorized = !!effect.auth;

        if (effect.balance) {
          line.balance = effect.balance;
          updateRippleBalance(effect.currency,
                                    effect.counterparty,
                                    effect.balance);
          balancesUpdated = true;
        }

        if (effect.deleted) {
          delete $scope.lines[index];
          return;
        }

        if (effect.limit) {
          line.limit = effect.limit;
        }

        if (effect.limit_peer) {
          line.limit_peer = effect.limit_peer;
        }

        $scope.lines[index] = $.extend($scope.lines[index], line);
      }
    });

    if (balancesUpdated) $scope.$broadcast('$balancesUpdate');
  }

  function updateRippleBalance(currency, new_account, new_balance)
  {
    // Ensure the balances entry exists first
    if (!$scope.balances[currency]) {
      $scope.balances[currency] = {components: {}, total: null};
    }

    var balance = $scope.balances[currency];

    if (new_account) {
      balance.components[new_account] = new_balance;
    }

    $(balance.components).sort(function(a,b){
      return a.compareTo(b);
    });

    balance.total = null;
    for (var counterparty in balance.components) {
      var amount = balance.components[counterparty];
      balance.total = balance.total ? balance.total.add(amount) : amount;
    }
  }

  $scope.currencies_all = require('../data/currencies');

  // prefer currency full_names over whatever the local storage has saved
  var storeCurrenciesAll = store.get('ripple_currencies_all') || [];

  // run through all currencies
  _.forEach($scope.currencies_all, function(currency) {

    // find the currency in the local storage
    var allCurrencyHit = _.where(storeCurrenciesAll, {value: currency.value})[0];

    // if the currency already exists in local storage, updated only the name
    if (allCurrencyHit) {
      allCurrencyHit.name = currency.name;
    } else {
      // else append the currency to the storeCurrenciesAll array
      storeCurrenciesAll.push(currency);
    }
  });

  $scope.currencies_all = storeCurrenciesAll;

  // Personalized default pair set
  if (!store.disabled && !store.get('ripple_pairs_all')) {
    store.set('ripple_pairs_all',require('../data/pairs'));
  }

  var pairs_all = store.get('ripple_pairs_all');
  var pairs_default = require('../data/pairs');
  $scope.pairs_all = genericUtils.uniqueObjArray(pairs_all, pairs_default, 'name');

  function compare(a, b) {
    if (a.order < b.order) return 1;
    if (a.order > b.order) return -1;
    return 0;
  }

  // sort currencies and pairs by order
  $scope.currencies_all.sort(compare);

  function compare_last_used(a, b) {
    var time_a = a.last_used || a.order || 0;
    var time_b = b.last_used || b.order || 0;
    if (time_a < time_b) return 1;
    if (time_a > time_b) return -1;
    return 0;
  }
  $scope.pairs_all.sort(compare_last_used);

  $scope.currencies_all_keyed = {};
  _.forEach($scope.currencies_all, function(currency){
    $scope.currencies_all_keyed[currency.value] = currency;
  });

  $scope.$watch('currencies_all', function(){
    if (!store.disabled) {
      store.set('ripple_currencies_all',$scope.currencies_all);
    }
  }, true);

  $scope.$watch('pairs_all', function(){
    if (!store.disabled) {
      store.set('ripple_pairs_all',$scope.pairs_all);
    }
  }, true);

  $scope.pairs = $scope.pairs_all.slice(1);

  $scope.app_loaded = 'loaded';

  // Moved this to the run block
  // Nav links same page click fix
  // $('nav a').click(function(){
  //   if (location.hash == this.hash) {
  //     location.href="#/";
  //     location.href=this.href;
  //   }
  // });

  $scope.$on('$idAccountLoad', function (e, data) {
    // fix blob if wrong
    if (_.isArray($scope.userBlob.data.clients)) {
      $scope.userBlob.unset('/clients');
    }

    // Server is connected
    if ($scope.connected) {
      handleAccountLoad(e, data);
    }

    // Server is not connected yet. Handle account load after server response.
    $scope.$on('$netConnected', function(){
      if ($.isEmptyObject($scope.account)) {
        $scope.$broadcast('$idAccountUnload', {account: $scope.account});
        handleAccountLoad(e, data);
      }
    });
  });

  $scope.$on('$idAccountUnload', handleAccountUnload);

  // XXX: The app also needs to handle updating its data when the connection is
  //      lost and later re-established. (... or will the Ripple lib do that for us?)
  var removeFirstConnectionListener =
        $scope.$on('$netConnected', handleFirstConnection);
  function handleFirstConnection() {
    removeFirstConnectionListener();
  }

  $net.listenId($id);
  $id.init();

  $scope.onlineMode ? $net.connect() : $net.disconnect();

  // Reconnect on server setting changes
  var netConnectedListener = function(){};
  $scope.$on('serverChange', function(event, serverSettings) {
    if ($scope.onlineMode) {
      var address = $scope.address;

      $net.disconnect();
      $net.connect(serverSettings);

      // Remove listener
      netConnectedListener();
      netConnectedListener = $scope.$on('$netConnected', function() {
        console.log('$scope.address', address);

        $id.setAccount(address);
      });
    }
  });

  $scope.logout = function () {
    $id.logout();
    $route.reload();
  };

  $scope.$on('$idRemoteLogout', handleRemoteLogout);
  function handleRemoteLogout()
  {
    $route.reload();
  }

  // Generate an array of source currencies for path finding.
  // This will generate currencies for every issuers.
  // It will also generate a self-issue currency for currencies which have multi issuers.
  //
  // Example balances for account rEXAMPLE:
  //   CNY: rCNY1
  //        rCNY2
  //   BTC: rBTC
  // Will generate:
  //   CNY/rEXAMPLE
  //   CNY/rCNY1
  //   CNY/rCNY2
  //   BTC/rBTC
  $scope.generate_src_currencies = function () {
    var src_currencies = [];
    var balances = $scope.balances;
    var isIssuer = $scope.generate_issuer_currencies();
    src_currencies.push({ currency: "XRP" });
    for (var currency_name in balances) {
      if (!balances.hasOwnProperty(currency_name)) continue;

      var currency = balances[currency_name];
      var currency_hex = currency.total.currency().to_hex();
      var result = [];
      for (var issuer_name in currency.components)
      {
        if (!currency.components.hasOwnProperty(issuer_name)) continue;
        var component = currency.components[issuer_name];
        if (component.is_positive())
          result.push({ currency: currency_hex, issuer: issuer_name});
      }

      if (result.length > 1 || isIssuer[currency_hex] || result.length === 0)
        result.unshift({ currency: currency_hex });

      src_currencies = src_currencies.concat(result);
    }
    return src_currencies;
  };

  $scope.generate_issuer_currencies = function () {
    var isIssuer = {};
    _.forEach($scope.lines, function(line){
      if (line.limit_peer.is_positive()) {
        isIssuer[line.balance.currency().to_hex()] = true;
      }
    });
    return isIssuer;
  };




  /**
   * Testing hooks
   */
  this.reset                  =  reset;
  this.handleAccountLoad      =  handleAccountLoad;
  this.handleAccountUnload    =  handleAccountUnload;
  this.handleRemoteLogout     =  handleRemoteLogout;
  this.handleRippleLines      =  handleRippleLines;
  this.handleRippleLinesError =  handleRippleLinesError;
  this.handleOffers           =  handleOffers;
  this.handleOffersError      =  handleOffersError;
  this.handleAccountEntry     =  handleAccountEntry;
  this.handleAccountTx        =  handleAccountTx;
  this.handleAccountTxError   =  handleAccountTxError;
  this.handleAccountEvent     =  handleAccountEvent;
  this.processTxn             =  processTxn;
  this.updateOffer            =  updateOffer;
  this.updateLines            =  updateLines;
  this.updateRippleBalance    =  updateRippleBalance;
  this.compare                =  compare;
  this.handleFirstConnection  =  handleFirstConnection;
}]);
