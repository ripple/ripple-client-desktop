/* Taken from https://github.com/DWand/nw-fileDialog */

var module = angular.module('filedialog', []);

module.factory('rpFileDialog', ['$rootScope', function($scope){
  var callDialog = function(dialog, callback) {
    dialog.addEventListener('change', function() {
      var result = dialog.value;
      callback(result);
    }, false);
    dialog.click();
  };

  var dialogs = {};
  
  dialogs.saveAs = function(callback, defaultFilename, acceptTypes) {
    var dialog = document.createElement('input');
    dialog.type = 'file';
    dialog.nwsaveas = defaultFilename || '';
    if (angular.isArray(acceptTypes)) {
      dialog.accept = acceptTypes.join(',');
    } else if (angular.isString(acceptTypes)) {
      dialog.accept = acceptTypes;
    }
    callDialog(dialog, callback);
  };
  
  dialogs.openFile = function(callback, multiple, acceptTypes) {
    var dialog = document.createElement('input');
    dialog.type = 'file';
    if (multiple === true) {
      dialog.multiple = 'multiple';
    }
    if (angular.isArray(acceptTypes)) {
      dialog.accept = acceptTypes.join(',');
    } else if (angular.isString(acceptTypes)) {
      dialog.accept = acceptTypes;
    }
    callDialog(dialog, callback);
  };
  
  dialogs.openDir = function(callback) {
    var dialog = document.createElement('input');
    dialog.type = 'file';
    dialog.nwdirectory = 'nwdirectory';
    callDialog(dialog, callback);
  };
  
  return dialogs;
}]);