var util = require('util'),
  Tab = require('../client/tab').Tab;

var TouTab = function() {
  Tab.call(this);
};

util.inherits(TouTab, Tab);

TouTab.prototype.tabName = 'tou';
TouTab.prototype.pageMode = 'single';
TouTab.prototype.parent = 'main';

TouTab.prototype.generateHtml = function() {
  return require('../../templates/tabs/tou.jade')();
};

TouTab.prototype.angular = function(module) {


  module.controller('TouCtrl', ['$scope', 'rpId',
    function($scope, $id) {

      $scope.acceptTou = function () {
        store.set('accepted_tou', true);
        $id.goId();
      };

      $scope.denyTou = function () {
        store.set('accepted_tou', false);
        $scope.showWarningMessage = true;
      }
    }
  ]);
};

module.exports = TouTab;
