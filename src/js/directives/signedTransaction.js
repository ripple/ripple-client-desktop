'use strict';

var fs = require('fs');

var module = angular.module('app');

module.directive('signedTransaction', ['rpFileDialog', function(fileDialog) {
  return {
    restrict: 'E',
    templateUrl: 'templates/' + lang + '/directives/signedTransaction.html',
    link: function($scope, element, attrs) {
      $scope.copy = function() {
        $(element).find('.txBlob').select();
        document.execCommand('copy');
      };

      // TODO Save in the format specified by DAVE
      $scope.save = function() {
        // Save with default name
        var txJSON = JSON.parse(attrs.txjson);
        var sequenceNumber = (Number(txJSON.Sequence));
        var sequenceLength = sequenceNumber.toString().length;
        var txnName = $scope.userBlob.data.account_id + '-' + new Array(10 - sequenceLength + 1).join('0') + sequenceNumber + '.txt';
        var txData = JSON.stringify({
          tx_json: txJSON,
          hash: attrs.hash,
          tx_blob: attrs.data
        });

        // No default name specified -- Save as
        fileDialog.saveAs(function(filename) {
          $scope.txFile = filename;

          // Write to file
          fs.writeFile(filename, txData);
        }, txnName);
      };
    }
  };
}]);
