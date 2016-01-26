'use strict';

var Promise = require('bluebird');

/**
 * TRAVEL RULE
 *
 * The travel rule service is used to send information
 * about transaction sender to known gateways.
 *
 */

var module = angular.module('travelrule', ['network']);

module.factory('rpTravelRule', ['$rootScope', 'rpNetwork',
                                  function($scope, net) {

  var travelRuleService = {};

  travelRuleService.getTravelRule = function(gatewayAddress, gatewayPublicKey) {
    return new Promise(function(resolve, reject) {
      net.remote.request(
        'account_info',
        {account: gatewayAddress, ledger: 'validated'},
        function (err, info) {

          if (err) {
            return reject(err);
          }

          if (gatewayPublicKey != null) {
            info.account_data.MessageKey = gatewayPublicKey;
          } else if (!info.account_data.MessageKey) {
            var err1 = 'Gateway account has no Message Key';
            console.log('info: ', info);
            return reject(err1);
          }

          var user_info = Options.user_info;

          var data = '' + (user_info.name ? user_info.name : '') +
            "\n" +
            (user_info.financial_institution ? user_info.financial_institution : '') +
            "\n" +
            (user_info.address.line1 ? user_info.address.line1 : '') +
            (user_info.address.line2 ? ', ' + user_info.address.line2 : '') +
            (user_info.address.city ? ', ' + user_info.address.city : '') +
            (user_info.address.subdivision ? ', ' + user_info.address.subdivision : '') +
            (user_info.address.postcode ? ', ' + user_info.address.postcode : '') +
            (user_info.address.country ? ', ' + user_info.address.country : '');

          var publicKey = ecies.publicKeyConvert(new Buffer(info.account_data.MessageKey, 'hex'), false);

          ecies.encrypt(new Buffer(publicKey, 'hex'), new Buffer(data))
            .then(function (encrypted) {
              var toSend =
                encrypted.iv.toString('base64') + ',' +
                encrypted.ephemPublicKey.toString('base64') + ',' +
                encrypted.ciphertext.toString('base64') + ',' +
                encrypted.mac.toString('base64');

              return resolve({sender_info: toSend});
            }).catch(function (err2) {
              return reject(err2);
          });
        }
      );
    });
  };

  return travelRuleService;
}]);
