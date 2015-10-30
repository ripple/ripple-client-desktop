'use strict';

window.jQuery = window.$ = require('jquery');
window.moment = require('moment');
window.store = require('store');
window.Spinner = require('spin');
//window.RippleAPI = require('ripple-lib').RippleAPI;
window.ripple = require('ripple-lib')._DEPRECATED;
window.RippleAddressCodec = require('ripple-address-codec');
window.RippleBinaryCodec = require('ripple-binary-codec');
window._ = require('lodash');
window.sjcl = require('sjcl');
require('../../../deps/sjcl-custom');

require('angular');
require('angular-route');
require('angular-messages');
require('angular-ui-bootstrap');
require('ng-sortable/dist/ng-sortable');
require('bootstrap/js/modal');
require('bootstrap/js/dropdown');
require('bootstrap/js/tooltip');
require('bootstrap/js/popover');
