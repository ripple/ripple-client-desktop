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
  module.controller('ColdwalletSettingsCtrl', ['$scope', 'rpId', 'rpFileDialog',
  function ($scope, id, fileDialog) {

    if (!id.loginStatus) {
      id.goId();
    }
    if ($scope.userBlob.data.defaultDirectory) {
      $scope.defaultDirectory = $scope.userBlob.data.defaultDirectory;
    }

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
  }]);
};

module.exports = ColdwalletSettingsTab;
