var fs = require('fs');

var module = angular.module('app');

module.directive('signedTransaction', ['rpFileDialog', function(fileDialog) {
  return {
    restrict: 'E',
    templateUrl: 'templates/' + lang + '/directives/signedTransaction.html',
    link: function($scope, element, attrs) {
      $scope.copy = function() {
        $(element).find('.txBlob').select();
        document.execCommand('copy')
      };

      // TODO Save in the format specified by DAVE
      $scope.save = function() {
        // Save as
        fileDialog.saveAs(function(filename) {
          $scope.txFile = filename;

          // Write to file
          // Sequence number gets incremented before you write to file so need to subtract 1 everytime
          fs.writeFile(filename, attrs.data);
        }, 'tx-' + (Number(attrs.sequence) - 1) + '.txt');
      };
    }
  };
}]);
