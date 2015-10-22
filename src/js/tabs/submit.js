'use strict';

var util = require('util');
var Tab = require('../client/tab').Tab;
var fs = require('fs');
var _ = require('lodash');

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
      var submittedTxns = 0;
      var preparedTxns = 0;
      $scope.txInfo = {};
      $scope.sequenceNumbers = [];

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

        // Child scopes listen to this event to fetch tx_blobs
        $scope.$broadcast('prepare');
      };

      // Child scope emits txInfo
      $scope.$on('prepared', function(preparedEvent, txInfo) {
        // Map filename to blob/sequence number
        $scope.txInfo[txInfo.file] = {
          blob: txInfo.blob,
          sequence: txInfo.sequence
        };
        // Keep track of sequence numbers of all txn files
        $scope.sequenceNumbers.push(txInfo.sequence);
        // Once all txns are prepared, sort by sequence and submit
        if (++preparedTxns === $scope.txFiles.length) {
          $scope.sequenceNumbers = _.sortBy($scope.sequenceNumbers);
          $scope.$broadcast('submit');
        }
      });

      // Listening for child scope transaction submission results
      $scope.$on('submitted', function() {
        // Once all txns have been submitted, set loading to false
        // reset global vars
        if (++submittedTxns === $scope.txFiles.length) {
          $scope.loading = false;
          preparedTxns = 0;
          submittedTxns = 0;
          $scope.txInfo = {};
          $scope.sequenceNumbers = [];
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

      // If the txn sequence is next in the queue, submit
      // Else wait 10 ms
      function checkAndSubmit(blob, sequence) {
        if (sequence === $scope.sequenceNumbers[0]) {
          // Remove current sequence from beginning of queue
          $scope.sequenceNumbers.shift();
          var request = new ripple.Request(network.remote, 'submit');
          request.message.tx_blob = blob;
          request.callback(function(submitErr, response) {
            $scope.$apply(function() {
              if (submitErr) {
                console.log('Error submitting transaction: ', submitErr);
                $scope.state = 'error';
                // Don't overwrite upstream error messagaes
                if (!$scope.result) {
                  $scope.result = 'Malformed transaction';
                }
              } else {
                if (response.engine_result_code === -96) {
                  // Sending account is unfunded
                  $scope.state = 'unfunded';
                  // Parse account from tx blob and display to user
                  var account;
                  try {
                    account = RippleBinaryCodec.decode(blob).Account;
                  } catch(e) {
                    console.log('Unable to convert tx blob to JSON: ', e);
                  }
                  $scope.account = account;
                } else if (response.engine_result_code === -183) {
                  // This could happen if, for example, the user opens a regular key wallet file
                  // and tries to submit a transaction, but the master key has revoked this regular key.
                  $scope.state = 'bad_auth_master';
                } else if (response.engine_result_code === 0) {
                  $scope.state = 'success';
                } else {
                  $scope.state = 'done';
                }
                $scope.result = response.engine_result;
              }
              $scope.$emit('submitted');
            });
          });
          if (!request.requested) {
            request.request();
          }
        } else {
          setTimeout(function() {
            checkAndSubmit(blob, sequence);
          }, 10);
        }
      }

      // read tx file and emit tx_blob to parent scope
      $scope.$on('prepare', function() {
        // Show loading...
        $scope.state = 'pending';

        var txBlob;
        var sequence;
        fs.readFile($scope.txFile, 'utf8', function(err, data) {
          if (err) {
            console.log('error reading file: ', err);
            $scope.state = 'error';
            $scope.result = 'Unable to read file';
          } else {
            // Transaction will either be a JSON transaction or the signed
            // blob only, in which case there will not be a tx_blob value
            try {
              var transaction = JSON.parse(data);
              txBlob = transaction.tx_blob;
            } catch(e) {
              txBlob = data;
            }
            // Test to see if blob is formatted properly
            try {
              sequence = RippleBinaryCodec.decode(txBlob).Sequence;
            } catch(e) {
              console.log('Corrupted blob: ', e);
              $scope.state = 'error';
              $scope.result = 'Malformed transaction';
            }
          }
          $scope.$emit('prepared', {
            file: $scope.txFile,
            blob: txBlob,
            sequence: sequence
          });
        });
      });

      // Parent broadcasts the submit event
      // Child row controller matches row filename with
      // blob/sequence and submits txn
      $scope.$on('submit', function() {
        var blob = $scope.txInfo[$scope.txFile].blob;
        var sequence = $scope.txInfo[$scope.txFile].sequence;
        checkAndSubmit(blob, sequence);
      });
    }
  ]);
};

module.exports = SubmitTab;
