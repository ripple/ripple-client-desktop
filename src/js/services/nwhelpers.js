/**
 * nw helper functions
 */

var module = angular.module('nwhelpers', []);

module.factory('rpNW', ['rpId',
  function($id) {
    var nwService = {},
      gui = require('nw.gui'),
      ctxMenu = new gui.Menu(),
      trayMenu = new gui.Menu(),
      menuItems = {},
      tray = null;

    // Get the tray
    nwService.getTray = function() {
      return nwService.tray;
    };

    // Get the context menu
    nwService.getCtxMenu = function() {
      return nwService.ctxMenu;
    };

    // Get the tray menu
    nwService.getTrayMenu = function() {
      return nwService.trayMenu;
    };

    // Context menu
    nwService.Menu = function(cutLabel, copyLabel, pasteLabel) {
      var cut = new gui.MenuItem({
          label: cutLabel || "Cut",
          click: function() {
            document.execCommand("cut");
          }
        }),
        copy = new gui.MenuItem({
          label: copyLabel || "Copy",
          click: function() {
            document.execCommand("copy");
          }
        }),
        paste = new gui.MenuItem({
          label: pasteLabel || "Paste",
          click: function() {
            document.execCommand("paste");
          }
        });

      ctxMenu.append(cut);
      ctxMenu.append(copy);
      ctxMenu.append(paste);

      return ctxMenu;
    };

    // remove tray
    nwService.removeTray = function() {
      if (tray) {
        tray.remove();
        tray = null;
        menuItems = {};
      }
    }

    // reset menu
    nwService.resetTrayMenu = function() {
      trayMenu = new gui.Menu();
      menuItems = {};
    }

    // Tray menu
    nwService.initTray = function() {
      nwService.removeTray();
      tray = new gui.Tray({
        tooltip: 'Ripple',
        icon: 'img/favicon.ico'
      });
      nwService.resetTrayMenu();
      // Give it a menu
      if ($id.loginStatus) {
        menuItems.balances = new gui.MenuItem({
          label: 'Balances',
          click: function() {
            location.hash = "#/balance";
          }
        });
        menuItems.send = new gui.MenuItem({
          label: 'Send',
          click: function() {
            location.hash = "#/send";
          }
        });
      } else {
        menuItems.login = new gui.MenuItem({
          label: 'Login',
          click: function() {
            location.hash = "#/login";
          }
        });
        menuItems.register = new gui.MenuItem({
          label: 'Register',
          click: function() {
            location.hash = "#/register";
          }
        });
      }

      angular.forEach(menuItems, function(item) {
        trayMenu.append(item);
      })

      tray.menu = trayMenu;
    }

    nwService.initCtxMenu = function() {
      var ctxmenu = new nwService.Menu();

      $(document).unbind("contextmenu").on("contextmenu", function(e) {
        e.preventDefault();
        e.target.tagName == 'INPUT' && ctxmenu.popup(e.originalEvent.x, e.originalEvent.y);
      });
    }

    return nwService;
  }
]);
