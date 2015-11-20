'use strict';

var util = require('util');
var Tab = require('../client/tab').Tab;
var fs = require('fs');
var _ = require('lodash');
var PriorityQueue = require('priorityqueuejs');
var async = require('async');

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

      // Update the file list
      // Takes array of file paths
      function addFiles(newFiles) {
        // Unique list, even if user adds same file twice
        var uniqueFiles = _.difference(newFiles, _.map($scope.txFiles, function(file) {
          return file.path;
        }));
        // For each added file path, read contents of file
        // Once all files have been read, update scope with new data
        async.map(uniqueFiles, function(fileName, cb) {
            fs.readFile(fileName, 'utf8', function(err, data) {
              if (err) {
                console.log('Error reading file: ', err);
                // Don't return as error b/c that will stop processing of all files
                // Instead handle in callback function
                cb(null, {
                  error: err,
                  path: fileName
                });
              } else {
                // parse data
                cb(null, {
                  path: fileName,
                  data: data
                });
              }
            });
          }, function(err, results) {
            if (err) {
              // Should never happen
              console.log('Unable to read files: ', err);
            } else {
              var newTxns = _.map(results, function(result) {
                // Error case 1: Can't read file
                var splitPath = result.path.split('/');
                var fileName = splitPath[splitPath.length - 1];
                if (result.error) {
                  console.log('Unable to read file: ', result);
                  return {
                    path: result.path,
                    fileName: fileName,
                    error: 'Unable to read file'
                  };
                }
                var txBlob;
                try {
                  var transaction = JSON.parse(result.data);
                  txBlob = transaction.tx_blob;
                } catch(error) {
                  txBlob = result;
                }
                var txJson;
                try {
                  txJson = RippleBinaryCodec.decode(txBlob);
                } catch (error) {
                  // Error case 2: can't decode tx blob
                  return {
                    path: result.path,
                    fileName: fileName,
                    error: 'Corrupt transaction blob'
                  };
                }
                return {
                  path: result.path,
                  txJson: txJson,
                  blob: txBlob
                };
              });
              $scope.$apply(function() {
                // Transaction were read and parsed without error
                var validTxns = _.filter(newTxns, function(txn) {
                  return txn.txJson;
                });
                // Error reading file or parsing data
                var newInvalidTxns = _.difference(newTxns, validTxns);
                $scope.invalidTxns = _.unique(_.union($scope.invalidTxns, newInvalidTxns), function(txn) {
                  return txn.path;
                });
                // Display files sorted by sequence number
                $scope.txFiles = _.sortBy(_.union($scope.txFiles, validTxns), function(file) {
                  return file.txJson.Sequence;
                });
              });
            }
          }
        );
      }

      // User drops files on transaction files dropzone
      $scope.initDropzone = function() {
        rpNW.dnd('txDropZone', {
          onDrop: function(e) {
            var newFiles = _.map(e.dataTransfer.files, function(file) {
              return file.path;
            });
            addFiles(newFiles);
          }
        });
      };

      // User clicks on "Add transaction files"
      $scope.fileInputClick = function() {
        // Call the nw.js file dialog
        fileDialog.openFile(function(evt) {
          // Update the file list
          // Unique array, even if user adds same file twice
          var newFiles = evt.split(';');
          addFiles(newFiles);
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
        // We only prepare valid txns for submission
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

      $scope.closeErrorForm = function() {
        $scope.invalidTxns = {};
      };
    }
  ]);

  // Individual transaction row controller
  module.controller('TxRowCtrl', ['$scope', 'rpNetwork',
    function ($scope, network) {
      // Remove the transaction from the list
      $scope.remove = function() {
        _.remove($scope.txFiles, function(row) {
          return row.path === $scope.txFile.path;
        });
      };

      // Check to see if txn is validated
      function pollStatus(txnHash) {
        network.remote.requestTransaction({hash: txnHash}, function(err, transaction) {
          if (err) {
            console.log('Error fetching transaction: ', err);
            $scope.$apply(function() {
              $scope.state = 'error';
            });
          } else if (typeof transaction.validated === 'undefined') {
            setTimeout(function() {
              pollStatus(txnHash);
            }, 1000);
          } else if (transaction.validated) {
            $scope.$apply(function() {
              $scope.state = 'success';
              $scope.message = 'Success.';
            });
          } else {
            $scope.$apply(function() {
              $scope.state = 'error';
              $scope.message = 'Network could not validate transaction';
            });
          }
        });
      }

      // If this row is next in the queue, submit
      // Else wait 10 ms
      function checkSequenceAndSubmit() {
        // Nothing in queue, nothing to do
        if ($scope.queue.isEmpty()) {
          return;
        }
        // This row is next in queue, submit transaction
        if ($scope.txFile.path === $scope.queue.peek().file) {
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
                pollStatus(response.tx_json.hash);
              } else if (response.engine_result_code === -96) {
                // Sending account is unfunded
                $scope.state = 'unfunded';
                var account = $scope.txFile.txJson.Account;
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
        $scope.message = 'Pending ...';
        // Add txns to PQ to order by sequence
        $scope.queue.enq({
          file: $scope.txFile.path,
          blob: $scope.txFile.blob,
          sequence: $scope.txFile.txJson.Sequence
        });
        $scope.$emit('prepared');
      });

      // Parent broadcasts the submit event
      $scope.$on('submit', function() {
        checkSequenceAndSubmit();
      });
    }
  ]);
};

module.exports = SubmitTab;
