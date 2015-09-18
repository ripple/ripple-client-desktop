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
  module.controller('ColdWalletCtrl', ['$rootScope', '$location', 'rpApi',
  function ($scope, $location, api) {

    var address = $scope.address;

    $scope.networkFee = api.getFee();

    // Get account trust flags
    api.getSettings(address)
    .then(function(settings) {
      // Force conversion to booleans, since ripple-lib returns
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
            description: 'Prevent issuances  being held without authorization'
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
            // Force boolean so undefined displays as false
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

    // Fetch the last transaction for this account
    api.getTransactions(address, {
      limit: 1
    })
    .then(function(transactions) {
      if (transactions && transactions.length) {
        $scope.$apply(function() {
          var txn = {
            type: transactions[0].type,
            outcome: transactions[0].outcome.result === 'tesSUCCESS' ? 'successful' : 'failed',
            origin: transactions[0].specification.source.address,
            destination: transactions[0].specification.destination.address,
            balanceChange: transactions[0].outcome.balanceChanges[address][0].value,
            currency: transactions[0].outcome.balanceChanges[address][0].currency,
            fee: transactions[0].outcome.fee
          };
          $scope.transaction = txn;
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

    // Return to login page
    $scope.gotoLogin = function() {
      $location.path('/login');
    };
  }]);
};

module.exports = ColdWalletTab;
