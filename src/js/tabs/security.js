var util = require('util');
var Tab  = require('../client/tab').Tab;

var SecurityTab = function ()
{
  Tab.call(this);
};

util.inherits(SecurityTab, Tab);

SecurityTab.prototype.tabName = 'security';
SecurityTab.prototype.mainMenu = 'security';

SecurityTab.prototype.generateHtml = function ()
{
  return require('../../templates/tabs/security.jade')();
};

SecurityTab.prototype.angular = function (module) {
  module.controller('SecurityCtrl', ['$scope', 'rpId',
                                     'rpKeychain', '$timeout', 'rpAuthFlow', 'rpPopup',
                                     function ($scope, $id,
                                               keychain, $timeout, authflow, popup)
  {
    if (!$id.loginStatus) $id.goId();

    $scope.settingsPage = 'security';
    
    $scope.showComponent = [];


    $scope.isUnlocked = true; //hiding the dialog for now
    //$scope.isUnlocked = keychain.isUnlocked($id.account);
    $scope.requirePasswordChanged = false;
   
    $scope.validation_pattern_phone = /^[0-9]*$/;

    $scope.$on('$blobUpdate', onBlobUpdate);
    onBlobUpdate();

    $scope.security = {};

    function onBlobUpdate()
    {
      if ("function" === typeof $scope.userBlob.encrypt) {
        $scope.enc = $scope.userBlob.encrypt();
      }
      

      $scope.requirePassword = !$scope.userBlob.data.persistUnlock;
    }

    $scope.restoreSession = function() {

      if (!$scope.sessionPassword) {
        $scope.unlockError = true;
        return;
      }

      $scope.isConfirming = true;
      $scope.unlockError  = null;

      keychain.getSecret($id.account, $id.username, $scope.sessionPassword, function(err, secret) {
        $scope.isConfirming = false;
        $scope.sessionPassword = '';
        
        if (err) {
          $scope.unlockError = err;
          return;
        }

        $scope.isUnlocked = keychain.isUnlocked($id.account);
      });

    };


    $scope.unmaskSecret = function () {
      keychain.requestSecret($id.account, $id.username, 'showSecret', function (err, secret) {
        if (err) {
          // XXX Handle error
          return;
        }

        $scope.security.master_seed = secret;
      });
    };


    $scope.setPasswordProtection = function () {
      $scope.editUnlock = false;
      
      //ignore it if we are not going to change anything
      if (!$scope.requirePasswordChanged) return;
      $scope.requirePasswordChanged = false;
      $scope.requirePassword        = !$scope.requirePassword;
      
      keychain.setPasswordProtection($scope.requirePassword, function(err, resp){
        if (err) {
          console.log(err);
          $scope.requirePassword = !$scope.requirePassword;
          //TODO: report errors to user
        }
      });
    };

    $scope.cancelUnlockOptions = function () {
      $scope.editUnlock = false;
    };

    $scope.changePassword = function() {
      $scope.loading = true;
      $scope.error = false;

      // Get the master key
      keychain.getSecret($id.account, $id.username, $scope.password,
          function (err, masterkey) {
            if (err) {
              console.log("client: account tab: error while " +
                  "unlocking wallet: ", err);

              $scope.error = 'wrongpassword';
              $scope.loading = false;
              return;
            }

            // Change password
            $id.changePassword({
              username: $id.username,
              password: $scope.password1,
              masterkey: masterkey,
              blob: $scope.userBlob
            }, function(err){
              if (err) {
                console.log('client: account tab: error while ' +
                    'changing the account password: ', err);
                $scope.error = true;
                $scope.loading = false;
                return;
              }

              $scope.success = true;
              reset();
            });
          }
      );
    };

    function requestToken (force, callback) {

      authflow.requestToken($scope.userBlob.url, $scope.userBlob.id, force, function(tokenError, tokenResp) {
        $scope.via = tokenResp.via;

        callback(tokenError, tokenResp);
      });
    }

    $scope.requestToken = function () {
      var force = $scope.via === 'app' ? true : false;
      
      $scope.isRequesting = true;
      requestToken(force, function(err, resp) {
        $scope.isRequesting = false;
        //TODO: present message of resend success or failure
      });
    };

    var reset = function() {

      $scope.openFormPassword = false;
      $scope.password1 = '';
      $scope.password2 = '';
      $scope.passwordSet = {};
      $scope.loading = false;
      $scope.error = false;

      if ($scope.changeForm) {
        $scope.changeForm.$setPristine(true);
      }
  };

  reset();
  $scope.success = false;

  }]);
};

module.exports = SecurityTab;
