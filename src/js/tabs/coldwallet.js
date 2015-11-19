'use strict';

var util = require('util');
var Tab = require('../client/tab').Tab;
var Amount = ripple.Amount;

function ColdWalletTab() {
  Tab.call(this);
}

util.inherits(ColdWalletTab, Tab);

ColdWalletTab.prototype.tabName = 'coldwallet';
ColdWalletTab.prototype.mainMenu = 'coldwallet';

ColdWalletTab.prototype.generateHtml = function () {
  return require('../../templates/tabs/tx.jade')();
};

ColdWalletTab.prototype.extraRoutes = [
  {name: '/coldwallet/:address'}
];

ColdWalletTab.prototype.angular = function (module) {
  module.controller('ColdWalletCtrl', ['$rootScope', '$routeParams', '$location', '$route', 'rpId', 'rpNetwork',
  function ($scope, $routeParams, $location, $route, id, network) {
    $scope.sequenceNumber = 1;
    $scope.accountError = false;

    // Parse the transaction returned by ripple-lib
    // Return a human-readable message for the UI.
    // We only consider transactions that originate from this account.
    /*function formatTxnMessage(txn, address) {
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
      } else if (txn.type === 'settings') {
        txnMessage += ' transaction.';
      }
      txnMessage += ' The fee was ' + txn.outcome.fee + ' XRP. ' +
      'The ID and sequence number of the transaction are ' + txn.id +
      ' and  ' + txn.sequence + '.';
      return txnMessage;
    }*/

    var address = $routeParams.address;
    $scope.address = address;

    // If we are online, fetch account info
    var watcher = $scope.$watch('connected', function() {
      if (!$scope.connected) return;

      $scope.networkFee = network.remote.createTransaction()._computeFee() / 1000000;

      var account = network.remote.account(address);
      var server = network.remote._getServer();

      account.entry(function(err, entry) {
        $scope.accountLoaded = true;

        if (err && err.remote && err.remote.error === 'actNotFound') {
          $scope.$apply(function() {
            $scope.accountError = 'Account ' + address + ' has not been funded';
          });

          return;
        }

        var defaultRipple = !!(entry.account_data.Flags & ripple.Remote.flags.account_root.DefaultRipple);
        var requireAuth = !!(entry.account_data.Flags & ripple.Remote.flags.account_root.RequireAuth);
        var globalFreeze = !!(entry.account_data.Flags & ripple.Remote.flags.account_root.GlobalFreeze);

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

        $scope.$apply(function() {
          $scope.accountInfo = accountInfo;
        });

        network.remote.requestAccountInfo({account: address})
          .on('success', function(info) {
            $scope.$apply(function() {
              $scope.regularKeyEnabled = info.account_data.RegularKey ? 'Yes' : 'No';
              $scope.xrpBalance = info.account_data.Balance / 1000000;

              // To calcute the XRP reserve and available balance
              var ownerCount  = info.account_data.OwnerCount || 0;
              $scope.reserve = server._reserve(ownerCount);
              var bal = Amount.from_json(info.account_data.Balance);
              $scope.max_spend = bal.subtract($scope.reserve);
            });
          }).request();

        // Fetch account trustlines and determine if any should have a warning
        network.remote.requestAccountLines({account: address})
          .on('success', function(lines) {
            $scope.$apply(function() {
              $scope.lines = lines.lines;
              // Display any trustlines where the flag does not match the
              // corresponding flag on the account root
              $scope.warningLines = _.reduce(lines.lines, function(result, line) {
                var warning1 = '';
                var warning2 = '';
                if (!!line.no_ripple === defaultRipple) {
                  warning1 += 'Rippling flag on line differs from flag on account root.';
                }
                if (!!line.authorized !== requireAuth) { // TODO line.authorized ?
                  warning2 += 'Trust line must be authorized.';
                }
                line.warning1 = warning1;
                line.warning2 =warning2;
                // Convert to boolean so undefined displays as false
                line.no_ripple = !!line.no_ripple;
                line.authorized = !!line.authorized;
                if (warning1 || warning2) {
                  result.push(line);
                }
                return result;
              }, []);
            });
          }).request();

        // If we have a sequence number from the network, display to user
        $scope.sequenceNumber = entry.account_data.Sequence;

        watcher();
      });

      // Fetch the most recent transaction for this account (if exists)
      /*network.remote.requestAccountTransactions({
        account: address,
        ledger_index_min: -1,
        descending: true,
        limit: 1,
        binary: false
      })
      .on('transactions', function(response) {
        if (response.transactions && response.transactions.length) {
          $scope.$apply(function() {
            console.log('tx', response.transactions[0]);
            $scope.txnTime = response.transactions[0].tx.date;
            $scope.lastTxn = formatTxnMessage(response.transactions[0], address);
          });
        }
      })
      .on('error', function(e){
        console.log('error fetching transactions: ', JSON.stringify(e));
        $scope.$apply(function() {
          $scope.transactionError = true;
          $scope.transactionErrorMessage = 'No transaction history available';
        });
      }).request();*/
    });

    $scope.refresh = function() {
      $route.reload();
    };
  }]);
};

module.exports = ColdWalletTab;
