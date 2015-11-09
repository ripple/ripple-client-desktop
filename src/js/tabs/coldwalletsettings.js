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

    // Update the blob with the new sequence
    $scope.saveSequence = function() {
      $rootScope.userBlob.set('/sequence', $scope.sequence);
      $rootScope.userBlob.set('/fee', $scope.fee);
      $rootScope.sequence = $rootScope.userBlob.data.sequence;
      $scope.saved = true;
    };
  }]);
};

module.exports = ColdwalletSettingsTab;
