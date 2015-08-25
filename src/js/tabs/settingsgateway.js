var util = require('util'),
    webutil = require('../util/web'),
    Tab = require('../client/tab').Tab;

var SettingsGatewayTab = function() {
  Tab.call(this);
};

util.inherits(SettingsGatewayTab, Tab);

SettingsGatewayTab.prototype.tabName = 'settingsgateway';
SettingsGatewayTab.prototype.mainMenu = 'settingsgateway';

SettingsGatewayTab.prototype.generateHtml = function() {
  return require('../../templates/tabs/settingsgateway.jade')();
};


SettingsGatewayTab.prototype.angular = function(module)
{
  module.controller('SettingsGatewayCtrl', ['$scope', 'rpId', 'rpKeychain', 'rpNetwork',
                                    function ($scope, id, keychain, network)
  {
    if (!id.loginStatus) id.goId();

    // from new Ripple lib
    var RemoteFlags = {
      // AccountRoot
      account_root: {
        PasswordSpent: 0x00010000, // password set fee is spent
        RequireDestTag: 0x00020000, // require a DestinationTag for payments
        RequireAuth: 0x00040000, // require a authorization to hold IOUs
        DisallowXRP: 0x00080000, // disallow sending XRP
        DisableMaster: 0x00100000,  // force regular key
        DefaultRipple: 0x00800000,
        NoFreeze: 0x00200000, // permanently disallowed freezing trustlines
        GlobalFreeze: 0x00400000 // trustlines globally frozen
      },
      // Offer
      offer: {
        Passive: 0x00010000,
        Sell: 0x00020000  // offer was placed as a sell
      },
      // Ripple tate
      state: {
        LowReserve: 0x00010000, // entry counts toward reserve
        HighReserve: 0x00020000,
        LowAuth: 0x00040000,
        HighAuth: 0x00080000,
        LowNoRipple: 0x00100000,
        HighNoRipple: 0x00200000
      }
    };
    var Transaction = {
      set_clear_flags : {
        AccountSet: {
          asfRequireDest: 1,
          asfRequireAuth: 2,
          asfDisallowXRP: 3,
          asfDisableMaster: 4,
          asfAccountTxnID: 5,
          asfNoFreeze: 6,
          asfGlobalFreeze: 7,
          asfDefaultRipple: 8
        }
      }
    };



    $scope.options = Options;
    $scope.optionsBackup = $.extend(true, {}, Options);
    $scope.edit = {
      advanced_feature_switch: false,
      defaultRippleFlag: false,
      defaultRippleFlagSaving: false
    };

    // Initialize the notification object
    $scope.success = {};

    $scope.saveBlob = function() {
      // Save in local storage
      if (!store.disabled) {
        store.set('ripple_settings', JSON.stringify($scope.options));
      }

      $scope.editBlob = false;
    };

    $scope.save = function(type) {
      switch (type) {
        case 'advanced_feature_switch':
          $scope.saveBlob();
          break;
        case 'defaultRippleFlag':
          // Need to set flag on account_root only when chosen option is different from current setting
          if ($scope.currentDefaultRipplingFlagSetting !== $scope.isDefaultRippleFlagEnabled) {
            $scope.edit.defaultRippleFlagSaving = true;
            var tx = network.remote.transaction();
            !$scope.isDefaultRippleFlagEnabled ? tx.accountSet(id.account, undefined, Transaction.set_clear_flags.AccountSet.asfDefaultRipple) : tx.accountSet(id.account, Transaction.set_clear_flags.AccountSet.asfDefaultRipple);
            tx.on('success', function(res) {
              $scope.$apply(function() {
                $scope.edit.defaultRippleFlagSaving = false;
                $scope.load_notification('defaultRippleUpdated');
              });
            });
            tx.on('error', function(res) {
              console.warn(res);
              $scope.$apply(function() {
                $scope.edit.defaultRippleFlagSaving = false;
              });
            });

            keychain.requestSecret(id.account, id.username, function(err, secret) {
              if (err) {
                console.log('Error: ', err);
                $scope.isDefaultRippleFlagEnabled = !$scope.isDefaultRippleFlagEnabled;
                $scope.edit.defaultRippleFlagSaving = false;
                return;
              }
              tx.secret(secret);
              tx.submit();
            });
          }
          break;
        default:
          $scope.saveBlob();
      }

      $scope.edit[type] = false;

      // Notify the user
      $scope.success[type] = true;
    };

    $scope.cancelEdit = function(type) {
      $scope.edit[type] = false;
      $scope.options[type] = $scope.optionsBackup[type];
    };

    $scope.$watch('account', function() {
      // Check if account has DefaultRipple flag set
      $scope.isDefaultRippleFlagEnabled = !!($scope.account.Flags & RemoteFlags.account_root.DefaultRipple);
      $scope.currentDefaultRipplingFlagSetting = $scope.isDefaultRippleFlagEnabled;
    }, true);

  }]);
};

module.exports = SettingsGatewayTab;
