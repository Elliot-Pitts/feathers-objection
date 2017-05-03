'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = errorHandler;

var _feathersErrors = require('feathers-errors');

var _feathersErrors2 = _interopRequireDefault(_feathersErrors);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function errorHandler(error) {
  var feathersError = error;

  if (error.code === 'SQLITE_ERROR') {
    switch (error.errno) {
      case 1:
      case 8:
      case 18:
      case 19:
      case 20:
        feathersError = new _feathersErrors2.default.BadRequest(error);
        break;
      case 2:
        feathersError = new _feathersErrors2.default.Unavailable(error);
        break;
      case 3:
      case 23:
        feathersError = new _feathersErrors2.default.Forbidden(error);
        break;
      case 12:
        feathersError = new _feathersErrors2.default.NotFound(error);
        break;
      default:
        feathersError = new _feathersErrors2.default.GeneralError(error);
        break;
    }

    throw feathersError;
  }

  // Objection validation error
  if (error.statusCode) {
    switch (error.statusCode) {
      case 400:
        feathersError = new _feathersErrors2.default.BadRequest(error.data);
        break;

      case 401:
        feathersError = new _feathersErrors2.default.NotAuthenticated(error.data);
        break;

      case 402:
        feathersError = new _feathersErrors2.default.PaymentError(error.data);
        break;

      case 403:
        feathersError = new _feathersErrors2.default.Forbidden(error.data);
        break;

      case 404:
        feathersError = new _feathersErrors2.default.NotFound(error.data);
        break;

      case 405:
        feathersError = new _feathersErrors2.default.MethodNotAllowed(error.data);
        break;

      case 406:
        feathersError = new _feathersErrors2.default.NotAcceptable(error.data);
        break;

      case 408:
        feathersError = new _feathersErrors2.default.Timeout(error.data);
        break;

      case 409:
        feathersError = new _feathersErrors2.default.Conflict(error.data);
        break;

      case 422:
        feathersError = new _feathersErrors2.default.Unprocessable(error.data);
        break;

      case 500:
        feathersError = new _feathersErrors2.default.GeneralError(error.data);
        break;

      case 501:
        feathersError = new _feathersErrors2.default.NotImplemented(error.data);
        break;

      case 503:
        feathersError = new _feathersErrors2.default.Unavailable(error.data);
        break;

      default:
        feathersError = new _feathersErrors2.default.GeneralError(error);
    }

    throw feathersError;
  }

  // Postgres error code
  // TODO
  // Properly detect postgres error
  if (typeof error.code === 'string') {
    var pgerror = error.code.substring(0, 2);

    switch (pgerror) {
      case '28':
        feathersError = new _feathersErrors2.default.Forbidden(error);
        break;

      case '20':
      case '21':
      case '22':
      case '23':
        feathersError = new _feathersErrors2.default.BadRequest(error);
        break;

      case '42':
        feathersError = new _feathersErrors2.default.Forbidden(error);
        break;

      default:
        feathersError = new _feathersErrors2.default.GeneralError(error);
    }

    throw feathersError;
  }

  throw feathersError;
}
module.exports = exports['default'];