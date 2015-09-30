'use strict';

var util = require('util');
var Tab = require('../client/tab').Tab;

function ColdWalletTab() {
  Tab.call(this);
}

util.inherits(ColdWalletTab, Tab);

ColdWalletTab.prototype.tabName = 'coldwallet';
ColdWalletTab.prototype.mainMenu = 'coldwallet';

ColdWalletTab.prototype.generateHtml = function () {
  return require('../../templates/tabs/tx.jade')();
};

ColdWalletTab.prototype.angular = function (module) {
  module.controller('ColdWalletCtrl', ['$rootScope', '$location', 'rpId', 'rpApi',
  function ($scope, $location, id, api) {
    $scope.sequenceNumber = 1;

    // Parse the transaction returned by ripple-lib
    // Return a human-readable message for the UI.
    // We only consider transactions that originate from this account.
    function formatTxnMessage(txn, address) {
      var outcome = txn.outcome.result === 'tesSUCCESS' ?
      'successful' : 'failed';

      var txnMessage = 'The most recent transaction was a ' + outcome +
      ' ' + txn.type;

      $scope.sequenceNumber = txn.type === 'orderCancellation' ?
      Number(txn.specification.orderSequence) + 1 : Number(txn.sequence) + 1;

      if (txn.type === 'payment') {
        txnMessage += ' to ' + txn.specification.destination.address + '. ' +
        ' You paid: ';
        var payments =  _.map(txn.outcome.balanceChanges[address],
          function(amount) {
            // Remove leading minus sign from amount
            // Truncate to 6 chars
            return amount.value.slice(1, 6) + ' ' + amount.currency;
          }).join(', ');
        txnMessage += payments + '. ';
      } else if (txn.type === 'order') {
        txnMessage += '. This was a ' + txn.specification.direction +
        ' order for ' + txn.specification.quantity.amount.value +
        ' of ' + txn.specification.quantity.amount.currency +
        ' at a price of ' + txn.specification.quantity.amount
        .value + ' ' + txn.specification.quantity.amount.currency + '. ';
      } else if (txn.type === 'trustline') {
        txnMessage += ' to ' + txn.specification.counterparty +
        ' with a limit of ' + txn.specification.limit + ' ' +
        txn.specification.currency + '.';
      } else if (txn.type === 'orderCancellation') {
        txnMessage += '. The order sequence was ' +
        txn.specification.orderSequence + '. ';
      }
      txnMessage += ' The fee was ' + txn.outcome.fee + ' XRP. ' +
      'The ID and sequence number of the transaction are ' + txn.id +
      ' and  ' + txn.sequence + '.';
      return txnMessage;
    }

    var address = $scope.address;

    // If we are online, fetch account info
    if ($scope.onlineMode) {
      $scope.networkFee = api.getFee() * 1000000;

      // Get account trust flags
      api.getSettings(address)
      .then(function(settings) {
        // Convert to boolean, since ripple-lib returns
        // flags as undefined if they are not set
        var defaultRipple = !!settings.defaultRipple;
        var requireAuth = !!settings.requireAuthorization;
        var globalFreeze = !!settings.globalFreeze;

        // Fetch account trustlines and determine if any should have a warning
        api.getTrustlines(address)
        .then(function(lines) {
          $scope.$apply(function() {
            // There are three flags the user is concerned with
            var accountInfo = [];
            accountInfo.push({
              setting: 'Require authorization',
              enabled: requireAuth,
              description: 'Prevent issuances from being held without authorization'
            });
            accountInfo.push({
              setting: 'Default Ripple',
              enabled: defaultRipple,
              description: 'Allow balances in trust lines to Ripple by default'
            });
            accountInfo.push({
              setting: 'Global Freeze',
              enabled: globalFreeze,
              description: 'Freeze all issuances'
            });
            $scope.accountInfo = accountInfo;

            // Display any trustlines where the flag does not match the
            // corresponding flag on the account root
            $scope.warningLines = _.reduce(lines, function(result, line) {
              var warning = '';
              if (!!line.specification.ripplingDisabled === defaultRipple) {
                warning += 'Rippling flag on line differs from flag on account root\n';
              }
              if (!!line.specification.authorized !== requireAuth) {
                warning += 'Authorization differs from authorization on account root';
              }
              line.warning = warning;
              // Convert to boolean so undefined displays as false
              line.specification.ripplingDisabled = !!line.specification.ripplingDisabled;
              line.specification.authorized = !!line.specification.authorized;
              if (warning) {
                result.push(line);
              }
              return result;
            }, []);
          });
        });
      })
      .catch(function(err) {
        console.log('Error fetching account informtion: ', JSON.stringify(err));
      });

      // Fetch the most recent transaction for this account (if exists)
      api.getTransactions(address, {
        limit: 1,
        initiated: true,
        binary: false
      })
      .then(function(transactions) {
        if (transactions && transactions.length) {
          $scope.$apply(function() {
            $scope.txnTime = transactions[0].outcome.timestamp;
            $scope.lastTxn = formatTxnMessage(transactions[0], address);
          });
        }
      })
      .catch(function(e) {
        console.log('error fetching transactions: ', JSON.stringify(e));
      });

      // Fetch account balances
      api.getBalances(address)
      .then(function(balances) {
        $scope.$apply(function() {
          $scope.balances = balances;
        });
      })
      .catch(function(err) {
        console.log('Error fetching account balance: ', JSON.stringify(err));
      });
    }

    // Return to login page
    $scope.gotoLogin = function() {
      id.exitColdWallet();
      $location.path('/login');
    };
  }]);
};

module.exports = ColdWalletTab;
