var util = require('util'),
    Tab = require('../client/tab').Tab;

var AccountFlagsTab = function() {
  Tab.call(this);
};

util.inherits(AccountFlagsTab, Tab);

AccountFlagsTab.prototype.tabName = 'accountflags';
AccountFlagsTab.prototype.mainMenu = 'accountflags';

AccountFlagsTab.prototype.generateHtml = function() {
  return require('../../templates/tabs/accountflags.jade')();
};

AccountFlagsTab.prototype.angular = function(module) {
  // Transaction AccountRoot set/clear flags
  var setClearFlags = {
    RequireDest: 1,
    RequireAuth: 2,
    DisallowXRP: 3,
    DisableMaster: 4,
    AccountTxnID: 5,
    NoFreeze: 6,
    GlobalFreeze: 7,
    DefaultRipple: 8
  };

  // AccountRoot flags from the new Ripple lib
  var RemoteFlags = {
    PasswordSpent: 0x00010000, // password set fee is spent
    RequireDestTag: 0x00020000, // require a DestinationTag for payments
    RequireAuth: 0x00040000, // require a authorization to hold IOUs
    DisallowXRP: 0x00080000, // disallow sending XRP
    DisableMaster: 0x00100000,  // force regular key
    DefaultRipple: 0x00800000,
    NoFreeze: 0x00200000, // permanently disallowed freezing trustlines
    GlobalFreeze: 0x00400000 // trustlines globally frozen
  };

  module.controller('AccountFlagsCtrl', ['$scope', 'rpId',
    function($scope, id)
  {
    if (!id.loginStatus) id.goId();

    // Used in offline mode
    if (!$scope.fee) {
      $scope.fee = Options.max_tx_network_fee;
    };

    $scope.flags = {
      DefaultRipple: {
        edit: false,
        description: 'Enable if you plan to issue balances'
      },
      RequireAuth: {
        edit: false,
        description: 'Enable if you require authorization for other users to extend a trust line to you'
      },
      GlobalFreeze: {
        edit: false,
        description: 'Enable if you want to freeze all assets issued by this account'
      },
      DisallowXRP: {
        edit: false,
        description: 'Disallow XRP'
      },
      AccountTxnID: {
        edit: false,
        description: 'Account Txn ID'
      }
    };

    $scope.saveTransaction = function(tx, hash, blob) {
      var sequenceNumber = (Number(tx.tx_json.Sequence));
      var sequenceLength = sequenceNumber.toString().length;
      var txnName = $scope.userBlob.data.account_id + '-' + new Array(10 - sequenceLength + 1).join('0') + sequenceNumber + '.txt';
      var txData = JSON.stringify({
        tx_json: tx.tx_json,
        hash: hash,
        tx_blob: blob
      });

      if (!$scope.userBlob.data.defaultDirectory) {
        $scope.fileInputClick(txnName, txData);
      } else {
        $scope.saveToDisk(txnName, txData);
      }
      $scope.signedTransaction = blob;
      $scope.hash = hash;
      $scope.txJSON = tx.tx_json;
      $scope.offlineSettingsChange = true;
    };

    $scope.$watch('account', function() {
      $scope.flags.DefaultRipple.enabled = !!($scope.account.Flags & RemoteFlags.DefaultRipple);
      $scope.flags.RequireAuth.enabled = !!($scope.account.Flags & RemoteFlags.RequireAuth);
      $scope.flags.GlobalFreeze.enabled = !!($scope.account.Flags & RemoteFlags.GlobalFreeze);
      $scope.flags.DisallowXRP.enabled = !!($scope.account.Flags & RemoteFlags.DisallowXRP);
      // AccountTxnID doesn't have a corresponding ledger flag
      $scope.flags.AccountTxnID.enabled = !!$scope.account.AccountTxnID;

      $scope.flags.DefaultRipple.newEnabled = $scope.flags.DefaultRipple.enabled;
      $scope.flags.RequireAuth.newEnabled = $scope.flags.RequireAuth.enabled;
      $scope.flags.GlobalFreeze.newEnabled = $scope.flags.GlobalFreeze.enabled;
      $scope.flags.DisallowXRP.newEnabled = $scope.flags.DisallowXRP.enabled;
      $scope.flags.AccountTxnID.newEnabled = $scope.flags.AccountTxnID.enabled;
    }, true);

  }]);

  module.controller('FlagCtrl', ['$scope', '$timeout', 'rpId', 'rpNetwork', 'rpKeychain',
    function($scope, $timeout, id, net, keychain) {
      var flag = $scope.flag;

      $scope.save = function() {
        // Need to set flag on account_root only when chosen option is different from current setting
        if ($scope.opts.enabled !== $scope.opts.newEnabled) {
          $scope.opts.saving = true;

          var tx = net.remote.transaction();
          var action;

          if ($scope.opts.newEnabled) {
            action = 'add';
            tx.accountSet(id.account, setClearFlags[flag]);
          } else {
            action = 'remove';
            tx.accountSet(id.account, undefined, setClearFlags[flag]);
          }

          tx.on('success', function() {
            $scope.$apply(function() {
              $scope.opts.saving = false;
              $scope.opts.edit = false;
              $scope.load_notification(flag + 'Updated');

              // Hack
              if (flag === 'AccountTxnID' && action === 'remove') {
                $timeout(function() {
                  $scope.opts.enabled = false;
                  $scope.opts.newEnabled = false;
                }, 200);
              }
            });
          });

          tx.on('error', function(res) {
            console.warn(res);
            $scope.$apply(function() {
              $scope.opts.saving = false;
              $scope.opts.engine_result = res.engine_result;
              $scope.opts.engine_result_message = res.engine_result_message;
              $scope.load_notification(flag + 'Failed');
            });
          });

          keychain.requestSecret(id.account, id.username, function(err, secret) {
            if (err) {
              console.warn(err);
              return;
            }

            tx.secret(secret);
            tx.submit();
          });
        }
      };

      $scope.saveOffline = function(action) {
        if (action !== 'add' && action !== 'remove') {
          console.warn('Wrong save action');
          return;
        }

        var tx = net.remote.transaction();

        if (action === 'add') {
          tx.accountSet(id.account, setClearFlags[flag]);
        } else {
          tx.accountSet(id.account, undefined, setClearFlags[flag]);
        }

        tx.tx_json.Sequence = Number($scope.sequence);
        $scope.incrementSequence();

        // Fee must be converted to drops
        tx.tx_json.Fee = ripple.Amount.from_json(Options.max_tx_network_fee).to_human() * 1000000;
        keychain.requestSecret(id.account, id.username, function(err, secret) {
          if (err) {
            console.warn(err);
            return;
          }
          tx.secret(secret);
          tx.complete();

          $scope.signedTransaction = tx.sign().serialize().to_hex();
          $scope.txJSON = JSON.stringify(tx.tx_json);
          $scope.hash = tx.hash('HASH_TX_ID', false, undefined);
          $scope.opts.edit = false;
          $scope.saveTransaction(tx, $scope.hash, $scope.signedTransaction);
        });
      };

      $scope.cancel = function() {
        $scope.opts.edit = false;
        $scope.opts.newEnabled = $scope.opts.enabled;
      };
    }
  ]);
};

module.exports = AccountFlagsTab;
