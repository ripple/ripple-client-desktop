var util = require('util'),
    webutil = require('../util/web'),
    Tab = require('../client/tab').Tab,
    Currency = ripple.Currency;

var AdvancedTab = function ()
{
  Tab.call(this);
};

util.inherits(AdvancedTab, Tab);

AdvancedTab.prototype.tabName = 'advanced';
AdvancedTab.prototype.mainMenu = 'advanced';

AdvancedTab.prototype.generateHtml = function ()
{
  return require('../../templates/tabs/advanced.jade')();
};

AdvancedTab.prototype.angular = function(module)
{
  module.controller('AdvancedCtrl', ['$scope', '$rootScope', '$route', 'rpId',
                                    function ($scope, $rootScope, $route, $id)
  {
    if (!$id.loginStatus) {
      $scope.showBanner = true;
      $scope.userCredentials.account = "";
    }
    // XRP currency object.
    // {name: "XRP - Ripples", order: 146, value: "XRP"}
    var xrpCurrency = Currency.from_json("XRP");

    $scope.xrp = {
      name: xrpCurrency.to_human({full_name:$scope.currencies_all_keyed.XRP.name}),
      code: xrpCurrency.get_iso(),
      currency: xrpCurrency
    };

    $scope.options = Options;
    $scope.optionsBackup = $.extend(true, {}, Options);
    $scope.editBlob = false;
    $scope.editMaxNetworkFee = false;
    $scope.editAcctOptions = false;
    $scope.max_tx_network_fee_human = ripple.Amount.from_json($scope.options.max_tx_network_fee).to_human();

    $scope.saveSetings = function() {
      // force serve ports to be number
      _.forEach($scope.options.connection.servers, function(s) {
        s.port = +s.port;
      });
      // Save in local storage
      if (!store.disabled) {
        store.set('ripple_settings', angular.toJson($scope.options));
      }
    };

    $scope.saveBlob = function() {

      $scope.saveSetings();

      $scope.editBlob = false;
      $scope.saved = false;

      // Reload
      $route.reload();
    };

    $scope.saveMaxNetworkFee = function () {
      // Save in local storage
      if (!store.disabled) {
        $scope.options.max_tx_network_fee = ripple.Amount.from_human($scope.max_tx_network_fee_human).to_json();
        store.set('ripple_settings', angular.toJson($scope.options));
      }

      $scope.editMaxNetworkFee = false;

      // Reload
      $scope.$emit('serverChange', $scope.options.connection);
      $route.reload();
    };

    $scope.cancelEditMaxNetworkFee = function () {
      $scope.editMaxNetworkFee = false;
      $scope.options.max_tx_network_fee = $scope.optionsBackup.max_tx_network_fee;
    };

    $scope.cancelEditAcctOptions = function () {
      $scope.editAcctOptions = false;
    };

    // Add a new server
    $scope.addServer = function () {
      // Create a new server line
      if(!$scope.options.connection.servers.isEmptyServer)
        $scope.options.connection.servers.push({isEmptyServer: true, secure: false});

      // Set editing to true
      $scope.editing = true;
      
    };

  }]);

  module.controller('ServerRowCtrl', ['$scope', '$route',
    function ($scope, $route) {
      $scope.editing = $scope.server.isEmptyServer;

        // Delete the server
      $scope.remove = function () {
        $scope.options.connection.servers.splice($scope.index,1);

        $scope.saveSetings();
        if (!$scope.server.isEmptyServer) {
          $route.reload();
        }
      };

      $scope.cancel = function () {
        if ($scope.server.isEmptyServer) {
          $scope.remove();
          return;
        }

        $scope.editing = false;
        $scope.server = $.extend({ '$$hashKey' : $scope.server.$$hashKey }, $scope.optionsBackup.server.servers[$scope.index]);
        Options.connection.servers[$scope.index] = $.extend({}, $scope.optionsBackup.server.servers[$scope.index]);
      };

      $scope.noCancel = function () {
        return $scope.server.isEmptyServer && $scope.options.connection.servers.length === 1;
      };

      $scope.save = function () {
        $scope.server.isEmptyServer = false;
        $scope.editing = false;

        $scope.saveSetings();

        $scope.$emit('serverChange', $scope.options.connection);

          // Reload
        $route.reload();
      };
    }
  ]);

  module.controller('ProxyCtrl', ['$scope', '$route', function($scope, $route) {
    $scope.init = function() {
      var proxy = /(https?):\/\/(([^:]*):([^@]*)@)?([^:]*)(:(\d+))?/g.exec(Options.connection.proxy);

      $scope.proxy = {};

      if (proxy) {
        $scope.proxy = {
          secure: proxy[1] === 'https',
          host: proxy[5],
          port: proxy[7],
          auth: !!(proxy[3] && proxy[4]),
          username: proxy[3],
          password: proxy[4]
        };
      }
    };

    $scope.clear = function() {
      $scope.save(true);
    };

    $scope.save = function(clear) {
      if (clear) {
        delete Options.connection.proxy;
      } else {
        Options.connection.proxy =
          ($scope.proxy.secure ? 'https' : 'http') + '://'
            + ($scope.proxy.auth && $scope.proxy.username && $scope.proxy.password
              ? $scope.proxy.username + ':' + $scope.proxy.password + '@' : '')
            + $scope.proxy.host
            + ($scope.proxy.port ? ':' + $scope.proxy.port : '');
      }

      // Save in local storage
      if (!store.disabled) {
        store.set('ripple_settings', angular.toJson(Options));
      }

      // Reload
      $route.reload();
    };

    $scope.cancel = function() {
      $scope.init();
      $scope.close();
    };

    $scope.close = function() {
      $scope.editProxy = false;
    };

    $scope.init();
  }]);
};

module.exports = AdvancedTab;
