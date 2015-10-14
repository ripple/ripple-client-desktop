var util = require('util'),
    webutil = require('../util/web'),
    Tab = require('../client/tab').Tab,
    Amount = ripple.Amount,
    Base = ripple.Base,
    Currency = ripple.Currency;

var ExchangeTab = function ()
{
  Tab.call(this);
};

util.inherits(ExchangeTab, Tab);

ExchangeTab.prototype.tabName = 'exchange';
ExchangeTab.prototype.mainMenu = 'exchange';

ExchangeTab.prototype.generateHtml = function ()
{
  return require('../../templates/tabs/exchange.jade')();
};

ExchangeTab.prototype.angular = function (module)
{
  module.controller('ExchangeCtrl', ['$scope', '$timeout', '$routeParams',
    'rpId', 'rpNetwork', 'rpKeychain', '$rootScope',
    function ($scope, $timeout, $routeParams, $id, $network, keychain, $rootScope)
    {

      function setEngineStatus(res, accepted) {
        $scope.engine_result = res.engine_result;
        $scope.engine_result_message = res.engine_result_message;
        switch (res.engine_result.slice(0, 3)) {
        case 'tes':
          $scope.tx_result = accepted ? 'cleared' : 'pending';
          break;
        case 'tem':
          $scope.tx_result = 'malformed';
          break;
        case 'ter':
          $scope.tx_result = 'failed';
          break;
        case 'tep':
          $scope.tx_result = 'partial';
          break;
        case 'tec':
          $scope.tx_result = 'claim';
          break;
        case 'tef':
          $scope.tx_result = 'failure';
          break;
        case 'tel':
          $scope.tx_result = 'local';
          break;
        default:
          console.warn('Unhandled engine status encountered!');
        }
      }

      if (!$id.loginStatus) $id.goId();

      var timer;

      // Remember user preference on Convert vs. Trade
      $rootScope.ripple_exchange_selection_trade = false;

      var xrpCurrency = Currency.from_json("XRP");

      $scope.xrp = {
        name: xrpCurrency.to_human({full_name:$scope.currencies_all_keyed["XRP"].name}),
        code: xrpCurrency.get_iso(),
        currency: xrpCurrency
      };

      $scope.$watch('exchange.amount', function () {
        $scope.update_exchange();
      }, true);

      $scope.$watch('exchange.currency_name', function () {
        var exchange = $scope.exchange;
        var currency = Currency.from_human($scope.exchange.currency_name ? $scope.exchange.currency_name : "XRP");
        exchange.currency_obj = currency;
        exchange.currency_code = currency.get_iso();
        exchange.currency_name = currency.to_human({
          full_name: $scope.currencies_all_keyed[currency.get_iso()] ? $scope.currencies_all_keyed[currency.get_iso()].name : null
        });
        $scope.update_exchange();
      }, true);


      $scope.reset_paths = function () {
        $network.remote.closeCurrentPathFind();
        var exchange = $scope.exchange;

        exchange.alternatives = [];
      };

      var pathUpdateTimeout;
      $scope.update_exchange = function () {
        var exchange = $scope.exchange;
        var currency = ripple.Currency.from_human(exchange.currency_name);

        $scope.reset_paths();

        // if formatted or money to exchange is 0 then don't calculate paths or offer to exchange
        if (parseFloat(exchange.amount) === 0 || !exchange.currency_name)
        {
          $scope.error_type = 'required';
          return false;
        }

        else {
          $scope.error_type = '';
        }

        var matchedCurrency = currency.has_interest() ? currency.to_hex() : currency.get_iso();
        var match = /^([a-zA-Z0-9]{3}|[A-Fa-f0-9]{40})\b/.exec(matchedCurrency);

        if (!match) {
          // Currency code not recognized, should have been caught by
          // form validator.
          return;
        }

        // Demurrage: Get a reference date five minutes in the future
        //
        // Normally, when using demurrage currencies, we would immediately round
        // down (e.g. 0.99999 instead of 1) as demurrage occurs continuously. Not
        // a good user experience.
        //
        // By choosing a date in the future, this gives us a time window before
        // this rounding down occurs. Note that for positive interest currencies
        // this actually *causes* the same odd rounding problem, so in the future
        // we'll want a better solution, but for right now this does what we need.
        var refDate = new Date(new Date().getTime() + 5 * 60000);

        exchange.amount_feedback = Amount.from_human('' + exchange.amount + ' ' + matchedCurrency, { reference_date: refDate });
        exchange.amount_feedback.set_issuer($id.account);

        if (exchange.amount_feedback.is_valid() && exchange.amount_feedback.is_positive()) {
          exchange.path_status = 'pending';
          exchange.alt = null;

          if (pathUpdateTimeout) clearTimeout(pathUpdateTimeout);
          pathUpdateTimeout = $timeout($scope.update_paths, 500);
        } else {
          exchange.path_status = 'waiting';
        }
      };

      $scope.update_paths = function () {
        $scope.$apply(function () {
          $scope.exchange.path_status = 'pending';
          var amount = $scope.exchange.amount_feedback;

          if (amount.is_zero()) {
            return;
          }
          var isIssuer = $scope.generate_issuer_currencies();
          var lastUpdate;

          // Start path find
          var pf = $network.remote.createPathFind({
            src_account: $id.account,
            dst_account: $id.account,
            dst_amount: amount
          });

          pf.on('error', function() {
            $scope.$apply(function () {
              $scope.exchange.path_status = 'error';
            });
          });

          pf.on('update', function(upd) {
            $scope.$apply(function () {
              lastUpdate = new Date();

              clearInterval(timer);
              timer = setInterval(function() {
                $scope.$apply(function() {
                  var seconds = Math.round((new Date() - lastUpdate) / 1000);
                  $scope.lastUpdate = seconds ? seconds : 0;
                });
              }, 1000);

              if (!upd.alternatives || !upd.alternatives.length) {
                $scope.exchange.path_status = 'no-path';
                $scope.exchange.alternatives = [];
              } else {
                var currencies = {};
                $scope.exchange.path_status = 'done';
                $scope.exchange.alternatives = _.filter(_.map(upd.alternatives, function (raw) {
                  var alt = {};

                  alt.amount = Amount.from_json(raw.source_amount);

                  alt.rate = alt.amount.ratio_human(amount);

                  // Scale amount by 1.01 to get a send max
                  // 1% greater than sending amount
                  var scaleAmount = alt.amount.to_json();
                  scaleAmount.value = 1.01;
                  alt.send_max = alt.amount.scale(scaleAmount);
                  alt.paths = raw.paths_computed
                      ? raw.paths_computed
                      : raw.paths_canonical;

                  if (alt.amount.issuer() !== $scope.address && !isIssuer[alt.amount.currency().to_hex()]) {
                    currencies[alt.amount.currency().to_hex()] = true;
                  }

                  return alt;
                }), function() {
                  return true;
                });
              }
            });
          });
        });
      };

      var updateCurrencyOptions = function(){
        // create a list of currency codes from the trust line objects
        var currencies = _.uniq(_.map($scope.lines, function (line) {
          return line.currency;
        }));

        // add XRP
        currencies.unshift('XRP');

        // create a currency object for each of the currency codes
        for (var i=0; i < currencies.length; i++) {
          currencies[i] = ripple.Currency.from_json(currencies[i]);
        }

        // create the display version of the currencies
        currencies = _.map(currencies, function (currency) {
          if ($scope.currencies_all_keyed[currency.get_iso()]) {
            return currency.to_human({full_name:$scope.currencies_all_keyed[currency.get_iso()].name});
          }

          return currency.get_iso();
        });

        $scope.currency_choices = currencies;
      };

      $scope.$on('$balancesUpdate', updateCurrencyOptions);

      $scope.reset = function () {
        $scope.mode = "form";

        // XXX Most of these variables should be properties of $scope.exchange.
        //     The Angular devs recommend that models be objects due to the way
        //     scope inheritance works.
        $scope.exchange = {
          amount: '',
          currency_name: $scope.xrp.name,
          currency_code: $scope.xrp.code,
          currency_obj: $scope.xrp.currency,
          path_status: 'waiting',
          fund_status: 'none'
        };
        $scope.nickname = '';
        $scope.error_type = '';
        if ($scope.exchangeForm) $scope.exchangeForm.$setPristine(true);
      };

      $scope.cancelConfirm = function () {
        $scope.mode = "form";
        $scope.exchange.alt = null;
      };

      $scope.reset_goto = function (tabName) {
        $scope.reset();

        // TODO do something clever instead of document.location
        // because goToTab does $scope.$digest() which we don't need
        document.location = '#' + tabName;
      };

      /**
       * N3. Confirmation page
       */
      $scope.exchange_prepared = function () {
        $scope.confirm_wait = true;
        $timeout(function () {
          $scope.confirm_wait = false;
        }, 1000, true);
        // Stop the pathfind - once we're on the confirmation page, we'll freeze
        // the last state we had so the user doesn't get surprises when
        // submitting.
        $network.remote.closeCurrentPathFind();
        $scope.mode = "confirm";
      };

      /**
       * N4. Waiting for transaction result page
       */
      $scope.exchange_confirmed = function () {

        // parse the currency name and extract the iso
        var currency = Currency.from_human($scope.exchange.currency_name);
        currency = currency.has_interest() ? currency.to_hex() : currency.get_iso();
        var amount = Amount.from_human('' + $scope.exchange.amount + ' ' + currency);

        amount.set_issuer($id.account);

        var tx = $network.remote.transaction();

        // Add memo to tx
        tx.addMemo('client', 'rt' + $rootScope.version);

        // Destination tag
        var destinationTag = webutil.getDestTagFromAddress($id.account);
        if (destinationTag) {
          tx.setDestinationTag(webutil.getDestTagFromAddress($id.account));
        }
        tx.payment($id.account, $id.account, amount.to_json());
        tx.setSendMax($scope.exchange.alt.send_max);
        tx.setPaths($scope.exchange.alt.paths);

        if ($scope.exchange.secret) {
          tx.setSecret($scope.exchange.secret);
        } else {
          // Get secret asynchronously
          keychain.requestSecret($id.account, $id.username,
            function (err, secret) {
              if (err) {
                console.log('client: exchange tab: error while ' +
                  'unlocking wallet: ', err);
                $scope.mode = 'error';
                $scope.error_type = 'unlockFailed';

                return;
              }

              $scope.exchange.secret = secret;
              $scope.exchange_confirmed();
            });
          return;
        }

        tx.on('proposed', function (res) {
          $scope.$apply(function () {
            setEngineStatus(res, false);
            $scope.exchanged(tx.hash);

            // Remember currency and increase order

            for (var i = 0; i < $scope.currencies_all.length; i++) {
              if ($scope.currencies_all[i].value.toLowerCase() === $scope.exchange.amount_feedback.currency().get_iso().toLowerCase()) {
                $scope.currencies_all[i].order++;
                break;
              }
            }
          });
        });
        tx.on('success', function(res) {
          setEngineStatus(res, true);
        });
        tx.on('error', function (res) {
          setImmediate(function () {
            $scope.$apply(function () {
              $scope.mode = 'error';

              if (res.result === 'tejMaxFeeExceeded') {
                $scope.error_type = 'maxFeeExceeded';
              }

              if (res.error === 'remoteError' &&
                  res.remote.error === 'noPath') {
                $scope.mode = 'status';
                $scope.tx_result = 'noPath';
              }
            });
          });
        });
        tx.submit();

        $scope.mode = 'sending';
      };

      /**
       * N6. exchanged page
       */
      $scope.exchanged = function (hash) {
        $scope.mode = "status";
        $network.remote.on('transaction', handleAccountEvent);

        function handleAccountEvent(e) {
          $scope.$apply(function () {
            if (e.transaction.hash === hash) {
              setEngineStatus(e, true);
              $network.remote.removeListener('transaction', handleAccountEvent);
            }
          });
        }
      };

      $scope.reset();

      updateCurrencyOptions();

      // Stop the pathfinding when leaving the page
      $scope.$on('$destroy', function() {
        $network.remote.closeCurrentPathFind();
      });
    }]);

  /**
   * Contact name and address uniqueness validator
   */
    // TODO move to global directives
  module.directive('unique', function() {
    return {
      restrict: 'A',
      require: '?ngModel',
      link: function ($scope, elm, attr, ctrl) {
        if (!ctrl) return;

        var validator = function(value) {
          var unique = !webutil.getContact($scope.userBlob.data.contacts,value);
          ctrl.$setValidity('unique', unique);
          if (unique) return value;
        };

        ctrl.$formatters.push(validator);
        ctrl.$parsers.unshift(validator);

        attr.$observe('unique', function() {
          validator(ctrl.$viewValue);
        });
      }
    };
  });
};

module.exports = ExchangeTab;
