var util = require('util'),
    webutil = require('../util/web'),
    Tab = require('../client/tab').Tab,
    fs = require('fs');

var AccountFlagsTab = function() {
  Tab.call(this);
};

util.inherits(AccountFlagsTab, Tab);

AccountFlagsTab.prototype.tabName = 'accountflags';
AccountFlagsTab.prototype.mainMenu = 'accountflags';

AccountFlagsTab.prototype.generateHtml = function() {
  return require('../../templates/tabs/accountflags.jade')();
};


AccountFlagsTab.prototype.angular = function(module)
{
  module.controller('AccountFlagsCtrl', ['$scope', 'rpId', 'rpKeychain', 'rpNetwork',
                                    function ($scope, id, keychain, network)
  {
    if (!id.loginStatus) id.goId();

    // Used in offline mode
    if (!$scope.fee) {
      $scope.fee = Options.max_tx_network_fee;
    }

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
      defaultRippleFlag: false,
      defaultRippleFlagSaving: false,
      requireAuthFlag: false,
      requireAuthFlagSaving: false,
      globalFreezeFlag: false,
      globalFreezeFlagSaving: false
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

    $scope.saveTransaction = function(tx) {
      var sequenceNumber = (Number(tx.tx_json.Sequence));
      var sequenceLength = sequenceNumber.toString().length;
      var txnName = $scope.userBlob.data.account_id + '-' + new Array(10 - sequenceLength + 1).join('0') + sequenceNumber + '.txt';
      var txData = JSON.stringify({
        tx_json: tx.tx_json,
        hash: $scope.hash,
        tx_blob: $scope.signedTransaction
      });
      if (!$scope.userBlob.data.defaultDirectory) {
        $scope.fileInputClick(txnName, txData);
      }
      else {
        $scope.saveToDisk(txnName, txData);
      }
    };

    $scope.addFlag = function(type) {
      if (!_.includes(['defaultRippleFlag', 'requireAuthFlag', 'globalFreezeFlag'], type)) {
        return;
      }

      var tx = network.remote.transaction();
      tx.accountSet(id.account, Transaction.set_clear_flags.AccountSet['asf' + type.charAt(0).toUpperCase() + type.slice(1, -4)]);
      tx.tx_json.Sequence = Number($scope.sequence);
      $scope.incrementSequence();
      // Fee must be converted to drops
      tx.tx_json.Fee = ripple.Amount.from_json(Options.max_tx_network_fee).to_human() * 1000000;
      keychain.requestSecret(id.account, id.username, function(err, secret) {
        if (err) {
          console.log('Error: ', err);
          $scope.edit[type] = false;
          return;
        }
        tx.secret(secret);
        tx.complete();
        $scope.signedTransaction = tx.sign().serialize().to_hex();
        $scope.txJSON = JSON.stringify(tx.tx_json);
        $scope.hash = tx.hash('HASH_TX_ID', false, undefined);
        $scope.offlineSettingsChange = true;
        $scope.edit[type] = false;
        $scope.saveTransaction(tx);
      });
    };

    $scope.removeFlag = function(type) {
      if (!_.includes(['defaultRippleFlag', 'requireAuthFlag', 'globalFreezeFlag'], type)) {
        return;
      }

      var tx = network.remote.transaction();
      tx.accountSet(id.account, undefined, Transaction.set_clear_flags.AccountSet['asf' + type.charAt(0).toUpperCase() + type.slice(1, -4)]);
      tx.tx_json.Sequence = Number($scope.sequence);
      $scope.incrementSequence();
      // Fee must be converted to drops
      tx.tx_json.Fee = ripple.Amount.from_json(Options.max_tx_network_fee).to_human() * 1000000;
      keychain.requestSecret(id.account, id.username, function(err, secret) {
        if (err) {
          console.log('Error: ', err);
          $scope.edit[type] = false;
          return;
        }
        tx.secret(secret);
        tx.complete();
        $scope.signedTransaction = tx.sign().serialize().to_hex();
        $scope.txJSON = JSON.stringify(tx.tx_json);
        $scope.hash = tx.hash('HASH_TX_ID', false, undefined);
        $scope.offlineSettingsChange = true;
        $scope.edit[type] = false;
        $scope.saveTransaction(tx);
      });
    };

    $scope.saveSetting = function(type) {
      switch (type) {
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
        case 'requireAuthFlag':
          // Need to set flag on account_root only when chosen option is different from current setting
          if ($scope.currentRequireAuthFlagSetting !== $scope.isRequireAuthFlagEnabled) {
            $scope.edit.requireAuthFlagSaving = true;
            var tx = network.remote.transaction();
            !$scope.isRequireAuthFlagEnabled ? tx.accountSet(id.account, undefined, Transaction.set_clear_flags.AccountSet.asfRequireAuth) : tx.accountSet(id.account, Transaction.set_clear_flags.AccountSet.asfRequireAuth);
            tx.on('success', function(res) {
              $scope.$apply(function() {
                $scope.edit.requireAuthFlagSaving = false;
                $scope.load_notification('requireAuthUpdated');
              });
            });
            tx.on('error', function(res) {
              console.warn(res);
              $scope.$apply(function() {
                $scope.edit.requireAuthFlagSaving = false;
                $scope.engine_result = res.engine_result;
                $scope.engine_result_message = res.engine_result_message;
                $scope.load_notification('requireAuthFailed');
              });
            });

            keychain.requestSecret(id.account, id.username, function(err, secret) {
              if (err) {
                console.log('Error: ', err);
                $scope.isRequireAuthFlagEnabled = !$scope.isRequireAuthFlagEnabled;
                $scope.edit.requireAuthFlagSaving = false;
                return;
              }
              tx.secret(secret);
              tx.submit();
            });
          }
          break;
        case 'globalFreezeFlag':
          // Need to set flag on account_root only when chosen option is different from current setting
          if ($scope.currentGlobalFreezeFlagSetting !== $scope.isGlobalFreezeFlagEnabled) {
            $scope.edit.globalFreezeFlagSaving = true;
            var tx = network.remote.transaction();
            // One call is for adding the globalFreeze flag and one is for removing it
            !$scope.isGlobalFreezeFlagEnabled ? tx.accountSet(id.account, undefined, Transaction.set_clear_flags.AccountSet.asfGlobalFreeze) : tx.accountSet(id.account, Transaction.set_clear_flags.AccountSet.asfGlobalFreeze);
            tx.on('success', function(res) {
              $scope.$apply(function() {
                $scope.edit.globalFreezeFlagSaving = false;
                $scope.load_notification('globalFreezeUpdated');
              });
            });
            tx.on('error', function(res) {
              console.warn(res);
              $scope.$apply(function() {
                $scope.edit.globalFreezeFlagSaving = false;
                $scope.engine_result = res.engine_result;
                $scope.engine_result_message = res.engine_result_message;
                $scope.load_notification('globalFreezeFailed');
              });
            });

            keychain.requestSecret(id.account, id.username, function(err, secret) {
              if (err) {
                console.log('Error: ', err);
                $scope.isGlobalFreezeFlagEnabled = !$scope.isGlobalFreezeFlagEnabled;
                $scope.edit.globalFreezeFlagSaving = false;
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

      // Check if account has RequireAuth flag set
      $scope.isRequireAuthFlagEnabled = !!($scope.account.Flags & RemoteFlags.account_root.RequireAuth);
      $scope.currentRequireAuthFlagSetting = $scope.isRequireAuthFlagEnabled;

      // Check if account has GlobalFreeze flag set
      $scope.isGlobalFreezeFlagEnabled = !!($scope.account.Flags & RemoteFlags.account_root.GlobalFreeze);
      $scope.currentGlobalFreezeFlagSetting = $scope.isGlobalFreezeFlagEnabled;
    }, true);

  }]);
};

module.exports = AccountFlagsTab;
