'use strict';

var util = require('util');
var Tab = require('../client/tab').Tab;
var fs = require('fs');
var _ = require('lodash');
var PriorityQueue = require('priorityqueuejs');

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
      var preparedTxns = 0;
      // Priority Queue orders txns by sequence, smallest to largest
      $scope.queue = new PriorityQueue(function(tx1, tx2) {
        return tx2.sequence - tx1.sequence;
      });

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
        // Child scopes listen to this event to enqueue tx_blobs
        $scope.$broadcast('prepare');
      };

      // Once all child rows emit "prepared" event, we are ready to submit
      $scope.$on('prepared', function() {
        if (++preparedTxns === $scope.txFiles.length) {
          $scope.$broadcast('submit');
        }
      });

      // Listening for child scope transaction submission results
      $scope.$on('submitted', function() {
        // Once all txns have been submitted, set loading to false
        // reset global vars
        if ($scope.queue.isEmpty()) {
          $scope.loading = false;
          preparedTxns = 0;
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
      $scope.remove = function() {
        _.remove($scope.txFiles, function(filename) {
          return filename === $scope.txFile;
        });
      };

      // If this row is next in the queue, submit
      // Else wait 10 ms
      function checkSequenceAndSubmit() {
        // Nothing in queue, nothing to do
        if ($scope.queue.isEmpty()) {
          return;
        }
        // This row is next in queue, submit transaction
        if ($scope.txFile === $scope.queue.peek().file) {
          var blob = $scope.queue.deq().blob;
          var request = new ripple.Request(network.remote, 'submit');
          request.message.tx_blob = blob;
          request.callback(function(submitErr, response) {
            $scope.$apply(function() {
              if (submitErr) {
                console.log('Error submitting transaction: ', submitErr);
                $scope.state = 'error';
                $scope.message = 'Malformed transaction';
                $scope.$emit('submitted');
                return;
              }
              if (response.engine_result_code === 0) {
                $scope.state = 'success';
                $scope.message = 'Success.';
              } else if (response.engine_result_code === -96) {
                // Sending account is unfunded
                $scope.state = 'unfunded';
                // Parse account from tx blob and display to user
                var account;
                try {
                  account = RippleBinaryCodec.decode(blob).Account;
                } catch(e) {
                  console.log('Unable to convert tx blob to JSON: ', e);
                }
                $scope.message = 'Fund ' + account + ' with XRP';
              } else if (response.engine_result_code === -183) {
                // This could happen if, for example, the user opens a regular key wallet file
                // and tries to submit a transaction, but the master key has revoked this regular key.
                $scope.state = 'bad_auth_master';
                $scope.message = 'Key used to sign this tx doesn\'t match the master key, and no regular key exists.';
              } else {
                $scope.state = 'error';
                $scope.message = response.engine_result_message;
              }
              $scope.$emit('submitted');
            });
          });
          if (!request.requested) {
            request.request();
          }
        } else {
          // Wait until it is time for this row to be submitted
          setTimeout(checkSequenceAndSubmit, 10);
        }
      }

      // read tx file and add to priority queue
      $scope.$on('prepare', function() {
        // Show loading...
        $scope.state = 'pending';

        fs.readFile($scope.txFile, 'utf8', function(err, data) {
          if (err) {
            console.log('error reading file: ', err);
            $scope.state = 'error';
            $scope.message = 'Unable to read file';
            // Emit event even if err since parent scope must
            // be notified that txn was attempted
            $scope.$emit('prepared');
            return;
          }
          // Transaction will either be a JSON transaction or the signed
          // blob only, in which case there will not be a tx_blob value
          var txBlob;
          var sequence;
          try {
            var transaction = JSON.parse(data);
            txBlob = transaction.tx_blob;
          } catch(e) {
            txBlob = data;
          }
          // Test to see if blob is formatted properly
          try {
            sequence = RippleBinaryCodec.decode(txBlob).Sequence;
            // Add txn to PQ to order by sequence number
            $scope.queue.enq({
              file: $scope.txFile,
              blob: txBlob,
              sequence: sequence
            });
          } catch(e) {
            console.log('Corrupted blob: ', e);
            $scope.state = 'error';
            $scope.message = 'Malformed transaction';
          }
          $scope.$emit('prepared');
        });
      });

      // Parent broadcasts the submit event
      $scope.$on('submit', function() {
        checkSequenceAndSubmit();
      });
    }
  ]);
};

module.exports = SubmitTab;
