var util = require('util');
var Tab = require('../client/tab').Tab;

var ColdWalletTab = function ()
{
  Tab.call(this);
};

util.inherits(ColdWalletTab, Tab);

ColdWalletTab.prototype.tabName = 'coldwallet';
ColdWalletTab.prototype.mainMenu = 'coldwallet';

ColdWalletTab.prototype.generateHtml = function ()
{
  return require('../../templates/tabs/tx.jade')();
};

ColdWalletTab.prototype.angular = function (module)
{
  module.controller('ColdWalletCtrl', ['$scope',
    function ($scope)
  {

  }]);
};

module.exports = ColdWalletTab;
