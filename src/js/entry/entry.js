var types = require('../util/types');

// Enable Copy-Paste on MacOs
var gui = require('nw.gui');
if (process.platform === "darwin") {
  var mb = new gui.Menu({type: 'menubar'});
  mb.createMacBuiltin('RippleClient', {
    hideEdit: false,
  });
  gui.Window.get().menu = mb;
}


// Moment.js
moment = require('moment');

// Load app modules
require('../controllers/app');
require('../controllers/navbar');
require('../directives/charts');
require('../directives/fields');
require('../directives/effects');
require('../directives/validators');
require('../directives/events');
require('../directives/formatters');
require('../directives/directives');
require('../directives/datalinks');
require('../directives/errors');
require('../directives/qr');
require('../filters/filters');
require('../services/globalwrappers');
require('../services/id');
require('../services/blob');
require('../services/authflow');
require('../services/keychain');
require('../services/network');
require('../services/books');
require('../services/transactions');
require('../services/ledger');
require('../services/popup');
require('../services/rippletxt');
require('../services/federation');
require('../services/domainalias');
require('../services/filedialog');

// Angular module dependencies
var appDependencies = [
  'ng',
  'ngRoute',
  // Controllers
  'app',
  'navbar',
  // Services
  'id',
  'filedialog',
  // Directives
  'charts',
  'effects',
  'events',
  'fields',
  'formatters',
  'directives',
  'validators',
  'datalinks',
  'errors',
  // Filters
  'filters',
  'ui.bootstrap',
  'ui.sortable'
];

// Load tabs
var tabdefs = [
  require('../tabs/register'),
  require('../tabs/login'),
  require('../tabs/balance'),
  require('../tabs/history'),
  require('../tabs/contacts'),
  require('../tabs/exchange'),
  require('../tabs/trust'),
  require('../tabs/send'),
  require('../tabs/trade'),
  require('../tabs/advanced'),
  require('../tabs/security'),
  require('../tabs/tx'),
  require('../tabs/xrp'),
  require('../tabs/eula'),
  require('../tabs/settingsgateway'),
  require('../tabs/settingstrade')
];

// Prepare tab modules
var tabs = tabdefs.map(function (Tab) {
  var tab = new Tab();

  if (tab.angular) {
    var module = angular.module(tab.tabName, tab.angularDeps);
    tab.angular(module);
    appDependencies.push(tab.tabName);
  }

  return tab;
});

var app = angular.module('rp', appDependencies);

// Global reference for debugging only (!)
var rippleclient = window.rippleclient = {};
rippleclient.app = app;
rippleclient.types = types;

// Install basic page template
angular.element('body').prepend(require('../../jade/client/index.jade')());

app.config(['$routeProvider', function ($routeProvider) {
  // Set up routing for tabs
  _.each(tabs, function (tab) {
    if ("function" === typeof tab.generateHtml) {
      var template = tab.generateHtml();

      var config = {
        tabName: tab.tabName,
        tabClass: 't-'+tab.tabName,
        pageMode: 'pm-'+tab.pageMode,
        mainMenu: tab.mainMenu,
        template: template
      };

      $routeProvider.when('/'+tab.tabName, config);
    }
  });

  // Language switcher
  $routeProvider.when('/lang/:language', {
    redirectTo: function(routeParams, path, search){
      lang = routeParams.language;

      if (!store.disabled) {
        store.set('ripple_language',lang ? lang : '');
      }

      // problem?
      // reload will not work, as some pages are also available for guests.
      // Logout will show the same page instead of showing login page.
      // This line redirects user to root (login) page
      var port = location.port.length > 0 ? ":" + location.port : "";
      location.href = location.protocol + '//' + location.hostname  + port + location.pathname;
    }
  });

  $routeProvider.otherwise({redirectTo: '/balance'});
}]);

app.run(['$rootScope', '$route', '$routeParams',
  function ($rootScope, $route, $routeParams)
  {
    // This is the desktop client
    $rootScope.productName = 'Ripple';

    // Global reference for debugging only (!)
    if ("object" === typeof rippleclient) {
      rippleclient.$scope = $rootScope;
      rippleclient.version = $rootScope.version =
        angular.element('#version').text();
    }

    // Helper for detecting empty object enumerations
    $rootScope.isEmpty = function (obj) {
      return angular.equals({},obj);
    };

    var scope = $rootScope;
    $rootScope.$route = $route;
    $rootScope.$routeParams = $routeParams;
    $('#main').data('$scope', scope);

    // Once the app controller has been instantiated
    // XXX ST: I think this should be an event instead of a watch
    scope.$watch("app_loaded", function on_app_loaded(oldval, newval) {
      $('nav a').click(function() {
        if (location.hash == this.hash) {
          scope.$apply(function () {
            $route.reload();
          });
        }
      });
    });
  }]);

if ("function" === typeof angular.resumeBootstrap) angular.resumeBootstrap();
