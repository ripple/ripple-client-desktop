'use strict';

var Promise = require('bluebird');
//var elliptic = require('elliptic');
var secp256k1 = require('secp256k1/elliptic');
var crypto = require('crypto');

/**
 * TRAVEL RULE
 *
 * The travel rule service is used to send to known gateways
 * information about transaction sender.
 *
 */

var module = angular.module('travelrule', ['network']);

module.factory('rpTravelRule', ['$rootScope', '$q', 'rpNetwork',
                                  function($scope, $q, net) {

  var travelRuleService = {};

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || "Assertion failed");
    }
  }

  /**
   * Compute the public key for a given private key.
   * @param {Buffer} privateKey - A 32-byte private key
   * @return {Buffer} A 65-byte public key.
   * @function
   */
  function getPublic(privateKey) {
    assert(privateKey.length === 32, "Bad private key");
    // See https://github.com/wanderer/secp256k1-node/issues/46
    var compressed = secp256k1.publicKeyCreate(privateKey);
    return secp256k1.publicKeyConvert(compressed, false);
  }

  function sha512(msg) {
    return crypto.createHash("sha512").update(msg).digest();
  }

  function aes256CbcEncrypt(iv, key, plaintext) {
    var cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    var firstChunk = cipher.update(plaintext);
    var secondChunk = cipher.final();
    return Buffer.concat([firstChunk, secondChunk]);
  }

  function aes256CbcDecrypt(iv, key, ciphertext) {
    var cipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    var firstChunk = cipher.update(ciphertext);
    var secondChunk = cipher.final();
    return Buffer.concat([firstChunk, secondChunk]);
  }

  function hmacSha256(key, msg) {
    return crypto.createHmac("sha256", key).update(msg).digest();
  }

  /**
   * Derive shared secret for given private and public keys.
   * @param {Buffer} privateKeyA - Sender's private key (32 bytes)
   * @param {Buffer} publicKeyB - Recipient's public key (65 bytes)
   * @return {Promise.<Buffer>} A promise that resolves with the derived
   * shared secret (Px, 32 bytes) and rejects on bad key.
   */
  function derive(privateKeyA, publicKeyB) {
    return new Promise(function(resolve) {
      resolve(secp256k1.ecdh(publicKeyB, privateKeyA));
    });
  }

  /**
   * Input/output structure for ECIES operations.
   * @typedef {Object} Ecies
   * @property {Buffer} iv - Initialization vector (16 bytes)
   * @property {Buffer} ephemPublicKey - Ephemeral public key (65 bytes)
   * @property {Buffer} ciphertext - The result of encryption (variable size)
   * @property {Buffer} mac - Message authentication code (32 bytes)
   */

  /**
   * Encrypt message for given recepient's public key.
   * @param {Buffer} publicKeyTo - Recipient's public key (65 bytes)
   * @param {Buffer} msg - The message being encrypted
   * @param {?{?iv: Buffer, ?ephemPrivateKey: Buffer}} opts - You may also
   * specify initialization vector (16 bytes) and ephemeral private key
   * (32 bytes) to get deterministic results.
   * @return {Promise.<Ecies>} - A promise that resolves with the ECIES
   * structure on successful encryption and rejects on failure.
   */
  function encrypt(publicKeyTo, msg, opts) {
    opts = opts || {};
    // Tmp variable to save context from flat promises;
    var ephemPublicKey;
    return new Promise(function(resolve) {
      var ephemPrivateKey = opts.ephemPrivateKey || crypto.randomBytes(32);
      ephemPublicKey = getPublic(ephemPrivateKey);
      resolve(derive(ephemPrivateKey, publicKeyTo));
    }).then(function(Px) {
      var hash = sha512(Px);
      var iv = opts.iv || crypto.randomBytes(16);
      var encryptionKey = hash.slice(0, 32);
      var macKey = hash.slice(32);
      var ciphertext = aes256CbcEncrypt(iv, encryptionKey, msg);
      var dataToMac = Buffer.concat([iv, ephemPublicKey, ciphertext]);
      var mac = hmacSha256(macKey, dataToMac);
      return {
        iv: iv,
        ephemPublicKey: ephemPublicKey,
        ciphertext: ciphertext,
        mac: mac
      };
    });
  }

  travelRuleService.getTravelRule = function(gatewayAddress) {
    return new Promise(function(resolve, reject) {
      net.remote.request(
        'account_info',
        {account: gatewayAddress, ledger: 'validated'},
        function (err, info) {

          if (err) {
            return reject(err);
          }

          if (!info.account_data.MessageKey) {
            var err1 = 'Gateway account has no Message Key';
            console.log('info: ', info);
            return reject(err1);
          }

          var user = Options.user_info;

          var data = '' + (user.name.first ? user.name.first : '') +
            (user.name.middle ? ' ' + user.name.middle : '') +
            (user.name.last ? ' ' + user.name.last : '') +
            "\n" +
            (user.address.line1 ? user.address.line1 : '') +
            (user.address.line2 ? ', ' + user.address.line2 : '') +
            (user.address.city ? ', ' + user.address.city : '') +
            (user.address.subdivision ? ', ' + user.address.subdivision : '') +
            (user.address.postcode ? ', ' + user.address.postcode : '') +
            (user.address.country ? ', ' + user.address.country : '');

          //var ec = new elliptic.ec('secp256k1');
          //var publicKey = ec.keyFromPublic(info.account_data.MessageKey, 'hex').getPublic(false, 'hex');

          // New secp256k1 supports public key compression/decompression
          var publicKey = secp256k1.publicKeyConvert(new Buffer(info.account_data.MessageKey, 'hex'), false);

          encrypt(new Buffer(publicKey, 'hex'), new Buffer(data))
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
