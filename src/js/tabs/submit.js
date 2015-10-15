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
  module.controller('SubmitCtrl', ['$scope', '$location', 'rpFileDialog', 'rpNW', 'rpNetwork',
    function ($scope, $location, fileDialog, rpNW, $net)
    {
      $net.connect();

      $scope.txFiles = [];

      // User drops files on transaction files dropzone
      $scope.initDropzone = function() {
        rpNW.dnd('txDropZone', {
          onDrop: function(e) {
            $scope.$apply(function() {
              var newFiles = _.map(e.dataTransfer.files, function(file) {
                return file.path;
              });
              // Unique array, even if user adds same file twice
              $scope.txFiles = _.union($scope.txFiles, newFiles);
            });
          }
        });
      };

      // User clicks on "Add transaction files"
      $scope.fileInputClick = function() {
        // Call the nw.js file dialog
        fileDialog.openFile(function(evt) {
          $scope.$apply(function() {
            // Update the file list
            // TODO list should be sorted by sequence number ASC
            // Unique array, even if user adds same file twice
            $scope.txFiles = _.union($scope.txFiles, evt.split(';'));
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
      $scope.$on('submitted', function(){
        i++;
        // Once all txns have been submitted, set loading to false
        if ($scope.txFiles.length <= i) {
          $scope.loading = false;
        }
      });

      $scope.gotoLogin = function() {
        $location.path('/login');
      };
    }
  ]);

  // Individual transaction row controller
  module.controller('TxRowCtrl', ['$scope', 'rpNetwork',
    function ($scope, network) {
      // Remove the transaction from the list
      $scope.remove = function(){
        $scope.txFiles.splice($scope.index,1);
      };

      // Parent broadcasts the submit event
      $scope.$on('submit', function() {
        // Transaction is done if it failed, or if it was submitted successfully
        if ($scope.state === 'done' || $scope.state === 'error') {
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
          // Transaction will either be a JSON transaction or the signed
          // blob only, in which case there will not be a tx_blob value
          var txBlob;
          try {
            var transaction = JSON.parse(data);
            txBlob = transaction.tx_blob;
          } catch(e) {
            txBlob = data;
          }

          // TODO validate blob
          // Submit the transaction to the network
          var request = new ripple.Request(network.remote, 'submit');
          request.message.tx_blob = txBlob;
          request.callback(function(err, response){
            $scope.$apply(function(){
              // broadcast submit event once we get callback from ripple-lib
              $scope.$emit('submit');
              if (err) {
                console.log('err', err);
                $scope.state = 'error';
                return;
              }

              $scope.state = 'done';
              $scope.result = response.engine_result;
            });
          });
          request.request();
        });
      })
    }
  ]);
};

module.exports = SubmitTab;
