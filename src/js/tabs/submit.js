var util = require('util');
var Tab = require('../client/tab').Tab;
var fs = require('fs');

var SubmitTab = function ()
{
  Tab.call(this);
};

util.inherits(SubmitTab, Tab);

SubmitTab.prototype.tabName = 'submit';
SubmitTab.prototype.mainMenu = 'coldwallet';

SubmitTab.prototype.generateHtml = function ()
{
  return require('../../templates/tabs/tx.jade')();
};

SubmitTab.prototype.angular = function (module)
{
  module.controller('SubmitCtrl', ['$scope', 'rpFileDialog',
    function ($scope, fileDialog)
    {
      $scope.txFiles = [];

      // User clicks on "Add transaction files"
      $scope.fileInputClick = function(){
        // Call the nw.js file dialog
        fileDialog.openFile(function(evt) {
          $scope.$apply(function() {
            // Update the file list
            // TODO list should be sorted by sequence number ASC
            $scope.txFiles = $scope.txFiles.concat(evt.split(';'));
          });
        }, true);
      };

      // User clicks the submit button
      $scope.submit = function() {
        $scope.loading = true;

        // Child scopes listen to this event to individually submit transactions
        $scope.$broadcast('submit');
      };

      var i = 0;
      // Listening for child scope transaction submission results
      $scope.$on('submitted', function(scope){
        i++;

        if ($scope.txFiles.length <= i) {
          $scope.loading = false;
          $scope.state = scope.targetScope.state || $scope.state;
        }
      })
    }
  ]);
  
  // Individual transaction row controller
  module.controller('TxRowCtrl', ['$scope', 'rpNetwork',
    function ($scope, network) {
      $scope.state = undefined;
      
      // Remove the transaction from the list
      $scope.remove = function(){
        $scope.txFiles.splice($scope.index,1);
      };

      // Parent broadcasts the submit event
      $scope.$on('submit', function() {
        // Don't submit it more then once
        if ($scope.state == 'done') {
          $scope.$emit('submitted');
          return;
        }

        // Show loading...
        $scope.state = 'pending';

        // Get the signedTransaction
        fs.readFile($scope.txFile, 'utf8', function(err, data){
          if (err) {
            console.log('err',err);
            return;
          }

          // TODO validate blob
          // Submit the transaction to the network
          var request = new ripple.Request(network.remote, 'submit');
          request.message.tx_blob = data;
          request.callback(function(err, response){
            $scope.$apply(function(){
              if (err) {
                console.log('err', err);
                $scope.state = 'error';
                $scope.$emit('submitted');
                return;
              }

              $scope.state = 'done';
              $scope.result = response.engine_result;

              // Tell the parent about the completion
              $scope.$emit('submitted');
            })
          });
          request.request();
        });
      })
    }
  ]);
};

module.exports = SubmitTab;
