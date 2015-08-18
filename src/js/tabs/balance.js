var util = require('util'),
    Tab = require('../client/tab').Tab,
    Amount = ripple.Amount,
    rewriter = require('../util/jsonrewriter');

var BalanceTab = function ()
{
  Tab.call(this);
};

util.inherits(BalanceTab, Tab);

BalanceTab.prototype.tabName = 'balance';
BalanceTab.prototype.mainMenu = 'wallet';

BalanceTab.prototype.angularDeps = Tab.prototype.angularDeps.concat(['qr']);

BalanceTab.prototype.generateHtml = function ()
{
  return require('../../templates/tabs/balance.jade')();
};

BalanceTab.prototype.angular = function (module)
{
  

  module.controller('BalanceCtrl', ['$rootScope', 'rpId',
                                     function ($scope, $id)
  {
    if (!$id.loginStatus) return $id.goId();
  }]);
};

module.exports = BalanceTab;
