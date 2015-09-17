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
  module.controller('ColdWalletCtrl', ['$scope', 'rpApi',
  function ($scope, api) {

    var address = $scope.account.Account;

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
          $scope.requireAuth = requireAuth;
          $scope.defaultRipple = defaultRipple;
          $scope.globalFreeze = globalFreeze;
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
            result.push(line);
            return result;
          }, []);
        });
      });
    })
    .catch(function(err) {
      console.log('Error fetching account informtion: ', JSON.stringify(err));
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
  }]);
};

module.exports = ColdWalletTab;
