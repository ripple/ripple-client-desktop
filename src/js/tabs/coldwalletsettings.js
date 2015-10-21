'use strict';

var util = require('util');
var Tab = require('../client/tab').Tab;

function ColdwalletSettingsTab() {
  Tab.call(this);
}

util.inherits(ColdwalletSettingsTab, Tab);

ColdwalletSettingsTab.prototype.tabName = 'coldwalletsettings';
ColdwalletSettingsTab.prototype.mainMenu = 'coldwalletsettings';

ColdwalletSettingsTab.prototype.generateHtml = function() {
  return require('../../templates/tabs/coldwalletsettings.jade')();
};


ColdwalletSettingsTab.prototype.angular = function(module) {
  module.controller('ColdwalletSettingsCtrl', ['$scope', '$rootScope', 'rpId', 'rpFileDialog',
  function ($scope, $rootScope, id, fileDialog) {

    if (!id.loginStatus) {
      id.goId();
    }
    if ($scope.userBlob.data.defaultDirectory) {
      $scope.defaultDirectory = $scope.userBlob.data.defaultDirectory;
    }

    // Convert max fee to drops for comparison with UI
    $scope.maxNetworkFee = ripple.Amount.from_json(Options.max_tx_network_fee).to_human() * 1000000;

    $scope.fileInputClick = function() {
      fileDialog.openDir(function(evt) {
        $scope.$apply(function() {
          $scope.defaultDirectory = evt;
          $scope.$watch('userBlob', function() {
            if ($scope.userBlob.data && $scope.userCredentials.username) {
              $scope.userBlob.set('/defaultDirectory', evt);
              $scope.defaultDirectory = $scope.userBlob.data.defaultDirectory;
            }
          });
        });
      });
    };

    // Update the blob with the new seq. and network fee
    $scope.saveSeqFee = function() {
      $rootScope.userBlob.set('/sequence', $scope.sequence);
      $rootScope.userBlob.set('/fee', $scope.fee);
      $rootScope.sequence = $rootScope.userBlob.data.sequence;
      $rootScope.fee = $rootScope.userBlob.data.fee;
      $scope.saved = true;
    };
  }]);
};

module.exports = ColdwalletSettingsTab;
