var util = require('util');
var Tab = require('../client/tab').Tab;

var LoginTab = function ()
{
  Tab.call(this);
};

util.inherits(LoginTab, Tab);

LoginTab.prototype.tabName = 'login';
LoginTab.prototype.pageMode = 'single';
LoginTab.prototype.parent = 'main';

LoginTab.prototype.generateHtml = function ()
{
  return require('../../templates/tabs/login.jade')();
};

LoginTab.prototype.angular = function (module) {
  module.controller('LoginCtrl', ['$scope', '$element', '$routeParams',
                                  '$location', 'rpId', '$rootScope',
                                  'rpPopup', '$timeout', 'rpFileDialog', 'rpNW',
                                  function ($scope, $element, $routeParams,
                                            $location, $id, $rootScope,
                                            popup, $timeout, filedialog, rpNW)
  {
    if ($id.loginStatus) {
      $location.path('/balance');
      return;
    }

    if(!!store.get('walletfile')) {
      $scope.walletfile = store.get('walletfile');
      angular.element("#login_password").focus();
    }

    $scope.fileInputClick = function(element){
      filedialog.openFile(function(evt) {
        $scope.$apply(function() {
          store.set('walletfile', evt);
          $scope.walletfile = evt;
          angular.element("#login_password").focus();
        });
      }, false);
    };

    $scope.mode = 'open';

    // wallet file drang & drop
    rpNW.dnd("walletfile", {
      onDrop: function(e) {
        $scope.$apply(function() {
          store.set('walletfile', e.dataTransfer.files[0].path);
          $scope.walletfile = e.dataTransfer.files[0].path;
          angular.element("#login_password").focus();
        });
      }
    });

    $scope.error = '';
    $scope.username = '';
    $scope.password = '';
    $scope.loginForm && $scope.loginForm.$setPristine(true);
    $scope.backendMessages = [];
    $rootScope.address = '';

    // Autofill fix
    $timeout(function(){
      $scope.$apply(function () {
        $scope.username = $element.find('input[name="login_username"]').val();
        $scope.password = $element.find('input[name="login_password"]').val();
      });
    }, 1000);

    $rootScope.$on("$blobError", function (e, err) {
      console.log("BLOB ERROR", arguments);
      $scope.backendMessages.push({'backend': err.backend, 'message': err.message});
    });

    var updateFormFields = function(){
      var username;
      var password;

      // There are multiple login forms due to the Ripple URI login feature.
      // But only one of them should be visible and that's the one we want.
      username = $element.find('input[name="login_username"]:visible').eq(0).val();
      password = $element.find('input[name="login_password"]:visible').eq(0).val();

      if ("string" === typeof username) {
        $scope.loginForm.login_username.$setViewValue(username);
      }
      if ("string" === typeof password) {
        $scope.loginForm.login_password.$setViewValue(password);
      }
    };

    // Issues #1024, #1060
    $scope.$watch('username',function(){
      $timeout(function(){
        $scope.$apply(function () {
         updateFormFields();
        })
      }, 50);
    });

    // Ok, now try to remove this line and then go write "a" for wallet name, and "a" for passphrase.
    // "Open wallet" is still disabled hah? no worries, just enter anything else and it will be activated.
    // Probably this is an AngularJS issue. Had no time to check it yet.
    $scope.$watch('password');

    $scope.submitForm = function() {
      if ($scope.ajax_loading) return;

      if (!$scope.walletfile) {
        $scope.ajax_loading = false;
        $scope.error = 'Please select a wallet file.';
        return;
      }

      $scope.backendMessages = [];

      // Issue #36: Password managers may change the form values without
      // triggering the events Angular.js listens for. So we simply force
      // an update of Angular's model when the form is submitted.
      updateFormFields();

      setImmediate(function () {
        $id.login({
          username: 'local',
          password: $scope.password,
          walletfile: $scope.walletfile
        }, function (err, blob) {
          $scope.$apply(function() {
            $scope.ajax_loading = false;
            $scope.status = '';

            if (err) {
              $scope.error = 'Login failed: Wallet file or password is wrong.';

              return;
            }
            $location.path('/balance');
          });
        });
      });

      $scope.ajax_loading = true;
      $scope.error = '';
      $scope.status = 'Fetching wallet...';
    };

    $scope.submitReadOnlyForm = function() {
      $id.enterReadOnlyMode($scope.readOnly);

      $location.path('/balance');
    };

    $scope.submitColdWalletForm = function() {
      $location.path('/coldwallet/' + $scope.coldWallet);
    };

    $scope.submitTxnForm = function() {
      $location.path('/submit');
    };
  }]);

  /**
   * Focus on username input only if it's empty. Otherwise focus on password field
   * This directive will not be used anywhere else, that's why it's here.
   */
  module.directive('rpFocusOnEmpty', ['$timeout', function($timeout) {
    return function($scope, element) {
      $timeout(function(){
        $scope.$watch(function () {return element.is(':visible')}, function(newValue) {
          if (newValue === true && !element.val())
            element.focus();
        })
      }, 200)
    }
  }]);
};



module.exports = LoginTab;
