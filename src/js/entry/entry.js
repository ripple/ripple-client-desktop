var types = require('../util/types');

// Dependencies
require("setimmediate");

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
require('../directives/signedTransaction');
require('../filters/filters');
require('../services/globalwrappers');
require('../services/id');
require('../services/blob');
require('../services/authflow');
require('../services/keychain');
require('../services/network');
//require('../services/api');
require('../services/books');
require('../services/transactions');
require('../services/ledger');
require('../services/popup');
require('../services/nwhelpers');
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
  'nwhelpers',
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
  'as.sortable'
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
  require('../tabs/eula'),
  require('../tabs/accountflags'),
  require('../tabs/settingstrade'),
  require('../tabs/coldwallet'),
  require('../tabs/submit'),
  require('../tabs/coldwalletsettings'),
  require('../tabs/tou')
];

// Language
window.lang = (function(){
  var languages = _.pluck(require('../../../l10n/languages.json').active, 'code');
  var resolveLanguage = function(lang) {
    if (!lang) return null;
    if (languages.indexOf(lang) != -1) return lang;
    if (lang.indexOf("_") != -1) {
      lang = lang.split("_")[0];
      if (languages.indexOf(lang) != -1) return lang;
    }
    return null;
  };
  return resolveLanguage(store.get('ripple_language')) ||
    resolveLanguage(window.navigator.userLanguage || window.navigator.language) ||
    'en';
})();

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
// for unit tests
//rippleclient.rewriter = rewriter;

// for unit tests
rippleclient.tabs = {};
_.forEach(tabs, function(tab) { rippleclient.tabs[tab.tabName] = tab; });

app.config(['$routeProvider', function ($routeProvider) {
  // Set up routing for tabs
  _.forEach(tabs, function (tab) {
    var config = {
      tabName: tab.tabName,
      tabClass: 't-' + tab.tabName,
      pageMode: 'pm-' + tab.pageMode,
      mainMenu: tab.mainMenu,
      templateUrl: 'templates/' + lang + '/tabs/' + tab.tabName + '.html'
    };

    if ('balance' === tab.tabName) {
      $routeProvider.when('/', config);
    }

    $routeProvider.when('/' + tab.tabName, config);

    if (tab.extraRoutes) {
      _.forEach(tab.extraRoutes, function(route) {
        $.extend({}, config, route.config);
        $routeProvider.when(route.name, config);
      });
    }

    _.forEach(tab.aliases, function (alias) {
      $routeProvider.when('/' + alias, config);
    });
  });

  // Language switcher
  $routeProvider.when('/lang/:language', {
    redirectTo: function(routeParams, path, search){
      lang = routeParams.language;

      if (!store.disabled) {
        store.set('ripple_language', lang ? lang : '');
      }

      // problem?
      // reload will not work, as some pages are also available for guests.
      // Logout will show the same page instead of showing login page.
      // This line redirects user to root (login) page
      var port = location.port.length > 0 ? ":" + location.port : "";
      location.href = location.protocol + '//' + location.hostname  + port + location.pathname;
    }
  });

  $routeProvider.otherwise({redirectTo: '/404'});
}]);

app.run(['$rootScope', '$route', '$routeParams', 'rpNW',
  function ($rootScope, $route, $routeParams, rpNW)
  {
    // This is the desktop client
    $rootScope.productName = 'Ripple Admin Console';

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
    $rootScope.lang = lang;
    $('#main').data('$scope', scope);

    // put Options to rootScope so it can be used in html templates
    $rootScope.globalOptions = Options;

    // Show loading while waiting for the template load
    $rootScope.$on('$routeChangeStart', function() {
      $rootScope.pageLoading = true;
    });

    $rootScope.$on('$routeChangeSuccess', function() {
      $rootScope.pageLoading = false;
    });

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

    rpNW.initCtxMenu();
    rpNW.initTray();
  }]);

if ("function" === typeof angular.resumeBootstrap) {
  angular.resumeBootstrap();

  angular.resumeBootstrap = function() {
    return false;
  };
}

/**
 * NW.js stuff
 */

var gui = require('nw.gui');
var win = gui.Window.get();

// Edit menu
if (process.platform === "darwin") {
  var mb = new gui.Menu({type: 'menubar'});
  mb.createMacBuiltin('Ripple Admin Console', {
    hideEdit: false
  });
  gui.Window.get().menu = mb;
}

// To open external links in the real browser
win.on('new-win-policy', function(frame, url, policy) {
  gui.Shell.openExternal(url);
  policy.ignore();
});
