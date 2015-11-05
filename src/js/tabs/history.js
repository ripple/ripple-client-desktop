var util = require('util'),
    webUtil = require('../util/web'),
    Tab = require('../client/tab').Tab,
    rewriter = require('../util/jsonrewriter'),
    fs = require('fs'),
    Amount = ripple.Amount,
    gui = require('nw.gui'),
    json2csv = require('json2csv');

var HistoryTab = function ()
{
  Tab.call(this);
};

util.inherits(HistoryTab, Tab);

HistoryTab.prototype.tabName = 'history';
HistoryTab.prototype.mainMenu = 'wallet';

HistoryTab.prototype.generateHtml = function ()
{
  return require('../../templates/tabs/history.jade')();
};

HistoryTab.prototype.angular = function (module) {
  module.controller('HistoryCtrl', ['$scope', 'rpId', 'rpNetwork', 'rpFileDialog',
                                     function ($scope, $id, $network, filedialog)
  {
    if (!$id.loginStatus) $id.goId();

    var history = [];

    // Latest transaction
    var latest;

    // History collection
    $scope.historyShow = [];

    $scope.copyTooltip = 'Click to copy the transaction hash';
    $scope.copy = function(hash) {
      var clipboard = gui.Clipboard.get();
      clipboard.set(hash, 'text');
    };

    // History states
    $scope.$watch('loadState.transactions',function(){
      $scope.historyState = !$scope.loadState.transactions ? 'loading' : 'ready';
    });

    // Open/close states of individual history items
    $scope.details = [];

    // Currencies from history
    var historyCurrencies = [];

    $scope.types = {
      sent: {
        'types': ['sent'],
        'checked': true
      },
      received: {
        'types': ['received'],
        'checked': true
      },
      gateways: {
        'types': ['trusting','trusted'],
        'checked': true
      },
      trades: {
        'types': ['offernew','exchange'],
        'checked': true
      },
      orders: {
        'types': ['offernew','offercancel','exchange'],
        'checked': true
      },
      other: {
        'types': ['accountset','failed','rippling','setregularkey'],
        'checked': true
      }
    };

    $scope.orderedTypes = ['sent','received','gateways','trades','orders','other'];

    if (store.get('ripple_history_type_selections')) {
      $scope.types = $.extend(true,$scope.types,store.get('ripple_history_type_selections'));
    }

    // Filters
    if (store.get('ripple_history_filters')) {
      $scope.filters = store.get('ripple_history_filters');
    } else {
      $scope.filters = {
        'currencies_is_active': false, // we do the currency filter only if this is true, which happens when at least one currency is off
        'currencies': {},
        'types': ['sent','received','exchange','trusting','trusted','offernew','offercancel','rippling','setregularkey'],
        'minimumAmount': 0.000001
      };
    }

    var getDateRangeHistory = function(dateMin,dateMax,callback)
    {
      var completed = false;
      var history = [];

      var params = {
        account: $id.account,
        ledger_index_min: -1,
        limit: 200,
        binary: false
      };

      var getTx = function(){
        $network.remote.requestAccountTransactions(params)
        .on('success', function(data) {
          if (data.transactions.length) {
            for(var i=0;i<data.transactions.length;i++) {
              var date = ripple.utils.toTimestamp(data.transactions[i].tx.date);

              if(date < dateMin.getTime()) {
                completed = true;
                break;
              }

              if(date > dateMax.getTime())
                continue;

              // Push
              var tx = rewriter.processTxn(data.transactions[i].tx, data.transactions[i].meta, $id.account);
              if (tx) history.push(tx);
            }

            if (data.marker) {
              params.marker = data.marker;
              $scope.tx_marker = params.marker;
            }
            else {
              // Received all transactions since a marker was not returned
              completed = true;
            }

            if (completed)
              callback(history);
            else
              getTx();
          } else {
            callback(history);
          }
        }).request();
      };

      getTx(0);
    };

    // DateRange filter form
    $scope.submitDateRangeForm = function() {
      $scope.dateMaxView.setDate($scope.dateMaxView.getDate() + 1); // Including last date
      changeDateRange($scope.dateMinView,$scope.dateMaxView);
    };

    $scope.submitMinimumAmountForm = function() {
      updateHistory();
    };

    var changeDateRange = function(dateMin,dateMax) {
      history = [];
      $scope.historyState = 'loading';

      getDateRangeHistory(dateMin,dateMax,function(hist){
        $scope.$apply(function () {
          history = hist;
          $scope.historyState = 'ready';
          updateHistory();
        })
      })
    };

    // All the currencies
    $scope.$watch('balances', function(){
      updateCurrencies();
    });

    // Types filter has been changed
    $scope.$watch('types', function(){
      var arr = [];
      var checked = {};
      _.forEach($scope.types, function(type,index){
        if (type.checked) {
          arr = arr.concat(type.types);
        }

        checked[index] = {
          checked: !!type.checked
        };
      });
      $scope.filters.types = arr;

      if (!store.disabled) {
        store.set('ripple_history_type_selections', checked);
      }
    }, true);

    if (!store.disabled) {
      $scope.$watch('filters', function(){
        store.set('ripple_history_filters', $scope.filters);
      }, true);
    }

    $scope.$watch('filters.types', function(){
      updateHistory();
    }, true);

    // Currency filter has been changed
    $scope.$watch('filters.currencies', function(){
      updateCurrencies();
      updateHistory();
    }, true);

    // New transactions
    $scope.$watchCollection('history',function(){
      history = $scope.history;

      updateHistory();

      // Update currencies
      if (history.length)
        updateCurrencies();
    },true);

    // Updates the history collection
    var updateHistory = function (){

      //$scope.typeUsage = [];
      //$scope.currencyUsage = [];
      $scope.historyShow = [];

      if (history.length) {
        var dateMin, dateMax;

        $scope.minLedger = 0;

        var currencies = _.map($scope.filters.currencies,function(obj,key){return obj.checked ? key : false});
        history.forEach(function(event)
        {
          // Calculate dateMin/dateMax. Used in date filter view
          if (!$scope.dateMinView) {
            if (!dateMin || dateMin > event.date)
              dateMin = event.date;

            if (!dateMax || dateMax < event.date)
              dateMax = event.date;
          }

          var affectedCurrencies = _.map(event.affected_currencies, function (currencyCode) {
            return ripple.Currency.from_json(currencyCode).to_human();
          });

          // Update currencies
          historyCurrencies = _.union(historyCurrencies, affectedCurrencies); // TODO put in one large array, then union outside of foreach

          // Calculate min ledger. Used in "load more"
          if (!$scope.minLedger || $scope.minLedger > event.ledger_index)
            $scope.minLedger = event.ledger_index;

          // Type filter
          if (event.transaction && event.transaction.type === 'error') ; // Always show errors
          else if (event.transaction && !_.includes($scope.filters.types,event.transaction.type))
            return;

          // Some events don't have transactions.. this is a temporary fix for filtering offers
          else if (!event.transaction && !_.includes($scope.filters.types,'offernew'))
            return;

          // Currency filter
          //if ($scope.filters.currencies_is_active && _.intersection(currencies,event.affected_currencies).length <= 0)
          //  return;

          var effects = [];
          var isFundedTrade = false; // Partially/fully funded
          var isCancellation = false;

          if (event.effects) {
            // Show effects
            $.each(event.effects, function(){
              var effect = this;
              switch (effect.type) {
                case 'offer_funded':
                case 'offer_partially_funded':
                case 'offer_bought':
                  isFundedTrade = true;
                  /* falls through */
                case 'offer_cancelled':
                  if (effect.type === 'offer_cancelled') {
                    isCancellation = true;
                    if (event.transaction && event.transaction.type === 'offercancel')
                      return;
                  }
                case 'regular_key_added':
                case 'regular_key_changed':
                case 'regular_key_removed':
                  effects.push(effect);
                  break;
              }
            });

            event.showEffects = effects;

            // Trade filter - remove open orders that haven't been filled/partially filled
            if (_.includes($scope.filters.types,'exchange') && !_.includes($scope.filters.types,'offercancel')) {
              if ((event.transaction && event.transaction.type === 'offernew' && !isFundedTrade) || isCancellation)
                return
            }

            effects = [ ];

            var amount, maxAmount;
            var minimumAmount = $scope.filters.minimumAmount;

            // Balance changer effects
            $.each(event.effects, function(){
              var effect = this;
              switch (effect.type) {
                case 'fee':
                case 'balance_change':
                case 'trust_change_balance':
                  effects.push(effect);

                  // Minimum amount filter
                  if (effect.type === 'balance_change' || effect.type === 'trust_change_balance') {
                    amount = effect.amount.abs().is_native()
                      ? effect.amount.abs().to_number() / 1000000
                      : effect.amount.abs().to_number();

                    if (!maxAmount || amount > maxAmount)
                      maxAmount = amount;
                    }
                  break;
              }
            });

            // Minimum amount filter
            if (maxAmount && minimumAmount > maxAmount)
              return;

            event.balanceEffects = effects;
          }

          // Don't show sequence update events
          if (event.effects && 1 === event.effects.length && event.effects[0].type == 'fee')
            return;

          // Push events to history collection
          $scope.historyShow.push(event);

          // Type and currency usages
          // TODO offers/trusts
          //if (event.transaction)
          //  $scope.typeUsage[event.transaction.type] = $scope.typeUsage[event.transaction.type] ? $scope.typeUsage[event.transaction.type]+1 : 1;

          //event.affected_currencies.forEach(function(currency){
          //  $scope.currencyUsage[currency] = $scope.currencyUsage[currency]? $scope.currencyUsage[currency]+1 : 1;
          //});
        });

        if ($scope.historyShow.length && !$scope.dateMinView) {
          setValidDateOnScopeOrNullify('dateMinView', dateMin);
          setValidDateOnScopeOrNullify('dateMaxView', dateMax);
        }
      }
    };

    // Update the currency list
    var updateCurrencies = function (){
      if (!$.isEmptyObject($scope.balances)) {
        var currencies = _.union(
          ['XRP'],
          _.map($scope.balances,function(obj,key){return obj.total.currency().to_human();}),
          historyCurrencies
        );

        var objCurrencies = {};

        var firstProcess = $.isEmptyObject($scope.filters.currencies);

        $scope.filters.currencies_is_active = false;

        _.forEach(currencies, function(currency){
          var checked = ($scope.filters.currencies[currency] && $scope.filters.currencies[currency].checked) || firstProcess;
          objCurrencies[currency] = {'checked':checked};

          if (!checked)
            $scope.filters.currencies_is_active = true;
        });

        $scope.filters.currencies = objCurrencies;
      }
    };

    var setValidDateOnScopeOrNullify = function(key, value) {
      if (isNaN(value) || value == null) {
        $scope[key] = null;
      } else {
        $scope[key] = new Date(value);
      }
    };

    $scope.loadMore = function () {
      var dateMin = $scope.dateMinView;
      var dateMax = $scope.dateMaxView;

      $scope.historyState = 'loading';

      var limit = 100; // TODO why 100?

      var params = {
        account: $id.account,
        ledger_index_min: -1,
        limit: limit,
        marker: $scope.tx_marker,
        binary: false
      };

      $network.remote.requestAccountTransactions(params)
      .on('success', function(data) {
        $scope.$apply(function () {
          if (data.transactions.length < limit) {

          }

          $scope.tx_marker = data.marker;

          if (data.transactions) {
            var transactions = [];

            data.transactions.forEach(function (e) {
              var tx = rewriter.processTxn(e.tx, e.meta, $id.account);
              if (tx) {
                var date = ripple.utils.toTimestamp(tx.date);

                if (dateMin && dateMax) {
                  if (date < dateMin.getTime() || date > dateMax.getTime())
                    return;
                } else if (dateMax && date > dateMax.getTime()) {
                  return;
                } else if (dateMin && date < dateMin.getTime()) {
                  return;
                }
                transactions.push(tx);
              }
            });

            var newHistory = _.uniq(history.concat(transactions),false,function(ev){return ev.hash});

            $scope.historyState = (history.length === newHistory.length) ? 'full' : 'ready';
            history = newHistory;
            updateHistory();
          }
        });
      }).request();
    }

    var exists = function(pty) {
      return typeof pty !== 'undefined';
    };

    // Change first letter of string to uppercase or lowercase
    var capFirst = function(str, caps) {
      var first = str.charAt(0);
      return (caps ? first.toUpperCase() : first.toLowerCase()) + str.slice(1);
    };

    // Convert Amount value to human-readable format
    var formatAmount = function(amount) {
      var formatted = '';

      if (amount instanceof Amount) {
        formatted = amount.to_human({group_sep: false, precision: 2});

        // If amount is very small and only has zeros (ex. 0.0000), raise precision
        if (formatted.length > 1 && 0 === +formatted) {
          formatted = amount.to_human({group_sep: false, precision: 20, max_sig_digits: 5});
        }
      }

      return formatted;
    };

    // Construct a CSV string by:
    // 1) Iterating over each line item in the *displayed* Transaction History
    // 2) If the type of Transaction is in scope, convert the relevant fields to strings in Key/Value pairs
    function prepareCsv(cb) {

      // Names in CSV file
      var fieldNames = ['Date', 'Time', 'Ledger Number', 'Transaction Type', 'Trust address',
      'Address sent from', 'Amount sent/sold', 'Currency sent/sold', 'Issuer of sent/sold ccy,',
      'Address sent to', 'Amount received', 'Currency received', 'Issuer of received ccy',
      'Executed Price', 'Network Fee paid', 'Transaction Hash'];
      // Do not re-order
      var fields = ['Date', 'Time', 'LedgerNum', 'TransType', 'TrustAddr',
      'FromAddr', 'SentAmount', 'SentCcy', 'SentIssuer',
      'ToAddr', 'RecvAmount', 'RecvCcy', 'RecvIssuer',
      'ExecPrice', 'Fee', 'TransHash'];

      var xrpIssuer = 'rrrrrrrrrrrrrrrrrrrrrhoLvTp';

      // Convert the fields of interest in buy & sell Amounts to strings in Key/Value pairs
      function getOrderDetails(keyVal, buy, sell) {
        if (buy !== null && buy instanceof Amount) {
          keyVal.SentAmount = formatAmount(buy);
          keyVal.SentCcy = buy.currency().get_iso();
          keyVal.SentIssuer = buy.issuer() === xrpIssuer ? 'NA' : buy.issuer();
        }

        if (sell !== null && sell instanceof Amount) {
          keyVal.RecvAmount = formatAmount(sell);
          keyVal.RecvCcy = sell.currency().get_iso();
          keyVal.RecvIssuer = sell.issuer() === xrpIssuer ? 'NA' : sell.issuer();
        }
      }

      // Only consider these rows when exporting to CSV
      var validRows = _.filter($scope.historyShow, function(historyEntry) {
        var transaction = historyEntry.transaction;
        var transType = exists(transaction) ? transaction.type : null;
        var type = historyEntry.tx_type;
        if (transType === 'failed' || historyEntry.tx_result !== 'tesSUCCESS') {
          // Ignore failed transactions
          return false;
        } else if (type === 'TrustSet' && (transType === 'trusted' || transType === 'trusting')) {
          // Valid trust sets
          return true;
        } else if (type === 'Payment' && transType !== null) {
          // Valid payments
          if (transType === 'sent' || transType === 'received') {
            return true;
          }
        } else if (type === 'Payment' || type === 'OfferCreate' || type === 'OfferCancel') {
          // Valid offers (Created / Cancelled / Executed)
          return true;
        }
        // All other txns are not exported to CSV
        return false;
      });

      var csvBody = _.map(validRows, function(histLine) {
        var transaction = histLine.transaction;
        var type = histLine.tx_type;
        var lineTemplate = {};

        var transType = exists(transaction) ? transaction.type : null;

        var dateTime = moment(histLine.date);
        // Fields common to all Transaction types
        lineTemplate.Date = dateTime.format('YYYY-MM-DD');
        lineTemplate.Time = dateTime.format('HH:mm:ss');
        lineTemplate.LedgerNum = histLine.ledger_index;
        lineTemplate.Fee = formatAmount(Amount.from_json(histLine.fee));
        lineTemplate.TransHash = histLine.hash;

        // Default type-specific fields to NA, they will be overridden later if applicable
        lineTemplate.TrustAddr = lineTemplate.FromAddr = lineTemplate.ToAddr = 'NA';
        lineTemplate.RecvAmount = lineTemplate.RecvCcy = lineTemplate.ExecPrice = 'NA';

        if (type === 'TrustSet') {
          // Trust Line (Incoming / Outgoing)
          var lineTrust = {};

          var trust = transType === 'trusted' ? 'Incoming' : 'Outgoing';

          lineTrust.TransType = trust + 'trust line';
          lineTrust.TrustAddr = transaction.counterparty;

          lineTrust.SentAmount = formatAmount(transaction.amount);
          lineTrust.SentCcy = transaction.currency;

          lineTrust.SentIssuer = lineTrust.RecvIssuer = 'NA';

          return $.extend({}, lineTemplate, lineTrust);
        } else if (type === 'Payment' && transType !== null) {
          // Payment (Sent / Received)
          var linePayment = {};
          var sent = transType === 'sent';

          linePayment.TransType = capFirst(transType, true) + ' ' + capFirst(type, false);

          if (sent) {
            // If sent, counterparty is Address To
            linePayment.ToAddr = transaction.counterparty;
            linePayment.FromAddr = $id.account;
          } else {
            // If received, counterparty is Address From
            linePayment.FromAddr = transaction.counterparty;
            linePayment.ToAddr = $id.account;
          }

          if (exists(transaction.amountSent)) {
            var amtSent = transaction.amountSent;
            linePayment.SentAmount = exists(amtSent.value) ? amtSent.value : formatAmount(Amount.from_json(amtSent));
            linePayment.SentCcy = exists(amtSent.currency) ? amtSent.currency : 'XRP';
            if (exists(transaction.sendMax)) {
              linePayment.SentIssuer = transaction.sendMax.issuer === xrpIssuer ? 'NA' : transaction.sendMax.issuer;
            }
          }

          linePayment.RecvAmount = formatAmount(transaction.amount);
          linePayment.RecvCcy = transaction.currency;
          linePayment.RecvIssuer = transaction.amount.issuer() === xrpIssuer ? 'NA' : transaction.amount.issuer();

          return $.extend({}, lineTemplate, linePayment);
        } else if (type === 'Payment' || type === 'OfferCreate' || type === 'OfferCancel') {
          // Offers (Created / Cancelled / Executed)
          var lineOffer = {};

          if (transType === 'offernew') {
            getOrderDetails(lineOffer, transaction.gets, transaction.pays);
            lineOffer.TransType = 'Offer Created';

            return $.extend({}, lineTemplate, lineOffer);
          } else if (transType === 'offercancel') {
            var offer = _.find(histLine.effects, function(lineEffect) {
              return lineEffect.type === 'offer_cancelled';
            });
            if (offer) {
              getOrderDetails(lineOffer, offer.gets, offer.pays);
              lineOffer.TransType = 'Offer Cancelled';

              return $.extend({}, lineTemplate, lineOffer);
            }
          } else {
            var index = 0;
            _.forEach(histLine.showEffects, function(effect) {
              var buy = null;
              var sell = null;
              var effectType = effect.type;
              if (effectType === 'offer_bought' || effectType === 'offer_funded' || effectType === 'offer_partially_funded') {
                // Order fills (partial or full)

                if (effectType === 'offer_bought') {
                  buy = exists(effect.paid) ? effect.paid : effect.pays;
                  sell = exists(effect.got) ? effect.got : effect.gets;
                } else {
                  buy = exists(effect.got) ? effect.got : effect.gets;
                  sell = exists(effect.paid) ? effect.paid : effect.pays;
                }

                getOrderDetails(lineOffer, buy, sell);
                lineOffer.TransType = 'Executed offer';
                lineOffer.ExecPrice = formatAmount(effect.price);

                if (index++ > 0) {
                  lineOffer.Fee = '';  // Fee only applies once
                }
                return $.extend({}, lineTemplate, lineOffer);
              }
            });
          }
        }
      });

      json2csv({data: csvBody, fields: fields, fieldNames: fieldNames}, function(err, csv) {
        if (err) {
          cb(err);
        } else {
          cb(null, csv);
        }
      });
    }

    $scope.exportToCsv = function() {
      // Default filename to display in dialog
      var csvFile = 'ripple_historic';

      prepareCsv(function(err, csv) {
        if (err) {
          console.log('Error preparing csv: ', err);
        } else {
          filedialog.saveAs(function(fileName) {
            fs.writeFile(fileName, csv);
          }, csvFile);
        }
      });
    };
  }]);
};

module.exports = HistoryTab;
