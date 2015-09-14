/**
 * Ripple API
 *
 * The RippleAPI service
 */

'use strict';

var module = angular.module('app');

module.factory('rpApi', function()
{
  return new RippleAPI(Options.api);
});