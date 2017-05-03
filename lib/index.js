'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.default = init;

var _uberproto = require('uberproto');

var _uberproto2 = _interopRequireDefault(_uberproto);

var _feathersQueryFilters = require('feathers-query-filters');

var _feathersQueryFilters2 = _interopRequireDefault(_feathersQueryFilters);

var _isPlainObject = require('is-plain-object');

var _isPlainObject2 = _interopRequireDefault(_isPlainObject);

var _errorHandler = require('./error-handler');

var _errorHandler2 = _interopRequireDefault(_errorHandler);

var _feathersErrors = require('feathers-errors');

var _objection = require('objection');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var METHODS = {
  $or: 'orWhere',
  $ne: 'whereNot',
  $in: 'whereIn',
  $nin: 'whereNotIn'
};

var OPERATORS = {
  $lt: '<',
  $lte: '<=',
  $gt: '>',
  $gte: '>=',
  $like: 'like'
};

/**
 * Class representing an feathers adapter for objection.js ORM.
 * @param {object} options
 * @param {string} [id='id'] - database id field
 * @param {object} options.model - an objection model
 * @param {object} [options.paginate]
 * @param {string} [allowedEager] - Objection eager loading string.
 */

var Service = function () {
  function Service(options) {
    _classCallCheck(this, Service);

    if (!options) {
      throw new Error('Objection options have to be provided');
    }

    if (!options.model) {
      throw new Error('You must provide an Objection Model');
    }

    this.options = options || {};
    this.usesPg = options.usesPg || false;
    this.id = options.id || 'id';
    this.paginate = options.paginate || {};
    this.events = options.events || [];
    this.Model = options.model;
    this.allowedEager = options.allowedEager || '[]';
    this.namedEagerFilters = options.namedEagerFilters;
    this.eagerFilters = options.eagerFilters;
    this.computedEagerFilters = options.computedEagerFilters;
  }

  _createClass(Service, [{
    key: 'extend',
    value: function extend(obj) {
      return _uberproto2.default.extend(obj, this);
    }

    /**
     * Maps a feathers query to the objection/knex schema builder functions.
     * @param query - a query object. i.e. { type: 'fish', age: { $lte: 5 }
     * @param params
     * @param parentKey
     */

  }, {
    key: 'objectify',
    value: function objectify(query, params, parentKey) {
      var _this = this;

      Object.keys(params || {}).forEach(function (key) {
        var value = params[key];

        if ((0, _isPlainObject2.default)(value)) {
          return _this.objectify(query, value, key);
        }

        var column = parentKey || key;
        var method = METHODS[key];
        var operator = OPERATORS[key] || '=';

        if (method) {
          if (key === '$or') {
            var self = _this;

            return value.forEach(function (condition) {
              query[method](function () {
                self.objectify(this, condition);
              });
            });
          }

          return query[method].call(query, column, value); // eslint-disable-line no-useless-call
        }

        return query.where(column, operator, value);
      });
    }
  }, {
    key: 'createQuery',
    value: function createQuery() {
      var _this2 = this;

      var paramsQuery = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      var _filter = (0, _feathersQueryFilters2.default)(paramsQuery),
          filters = _filter.filters,
          query = _filter.query;

      var q = this.Model.query().skipUndefined().allowEager(this.allowedEager);

      var eagerFilters = this.namedEagerFilters;
      if (this.computedEagerFilters && query.$eagerFilterParams) {
        var paramEntries = Object.entries(query.$eagerFilterParams);
        paramEntries.map(function (paramEntry) {
          var eagerFilter = _this2.computedEagerFilters[paramEntry[0]];
          if (eagerFilter) {
            return [paramEntry[0], eagerFilter(paramEntry[1])];
          }
          return null;
        }).filter(function (ef) {
          return ef;
        }).forEach(function (eagerFilter) {
          eagerFilters[eagerFilter[0]] = eagerFilter[1];
        });
        delete query.$eagerFilterParams;
      }

      // $eager for objection eager queries
      var $eager = void 0;
      if (query && query.$eager) {
        $eager = query.$eager;
        delete query.$eager;
        q.eager($eager, eagerFilters);
      }

      // $select uses a specific find syntax, so it has to come first.
      if (filters.$select) {
        var _Model$query$skipUnde;

        q = (_Model$query$skipUnde = this.Model.query().skipUndefined().allowEager(this.allowedEager)).select.apply(_Model$query$skipUnde, _toConsumableArray(filters.$select.concat(this.id))).eager($eager, eagerFilters);
      }

      // apply eager filters if specified
      if (this.eagerFilters) {
        var _eagerFilters = this.eagerFilters;
        if (Array.isArray(_eagerFilters)) {
          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = _eagerFilters[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              var eagerFilter = _step.value;

              q.filterEager(eagerFilter.expression, eagerFilter.filter);
            }
          } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
              }
            } finally {
              if (_didIteratorError) {
                throw _iteratorError;
              }
            }
          }
        } else {
          q.filterEager(_eagerFilters.expression, _eagerFilters.filter);
        }
      }

      // build up the knex query out of the query params
      this.objectify(q, query);

      if (filters.$sort) {
        Object.keys(filters.$sort).forEach(function (key) {
          q = q.orderBy(key, filters.$sort[key] === 1 ? 'asc' : 'desc');
        });
      }

      return q;
    }
  }, {
    key: '_find',
    value: function _find(params, count) {
      var getFilter = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : _feathersQueryFilters2.default;

      var _getFilter = getFilter(params.query || {}),
          filters = _getFilter.filters,
          query = _getFilter.query;

      var q = params.objection || this.createQuery(params.query);

      // Handle $limit
      if (filters.$limit) {
        q.limit(filters.$limit);
      }

      // Handle $skip
      if (filters.$skip) {
        q.offset(filters.$skip);
      }

      var executeQuery = function executeQuery(total) {
        return q.then(function (data) {
          return {
            total: total,
            limit: filters.$limit,
            skip: filters.$skip || 0,
            data: data
          };
        });
      };

      if (filters.$limit === 0) {
        executeQuery = function executeQuery(total) {
          return Promise.resolve({
            total: total,
            limit: filters.$limit,
            skip: filters.$skip || 0,
            data: []
          });
        };
      }
      delete query.$eager;

      if (count) {
        var countQuery = this.Model.query().skipUndefined().count(this.id + ' as total');

        this.objectify(countQuery, query);

        return countQuery.then(function (count) {
          return count[0].total;
        }).then(executeQuery);
      }

      return executeQuery().catch(_errorHandler2.default);
    }

    /**
     * `find` service function for objection.
     * @param params
     */

  }, {
    key: 'find',
    value: function find(params) {
      var paginate = params && typeof params.paginate !== 'undefined' ? params.paginate : this.paginate;
      var result = this._find(params, !!paginate.default, function (query) {
        return (0, _feathersQueryFilters2.default)(query, paginate);
      });

      if (!paginate.default) {
        return result.then(function (page) {
          return page.data;
        });
      }

      return result;
    }
  }, {
    key: '_get',
    value: function _get(id, params) {
      var query = _extends({}, params.query);
      query[this.id] = id;

      return this._find(_extends({}, params, { query: query })).then(function (page) {
        if (page.data.length !== 1) {
          throw new _feathersErrors.errors.NotFound('No record found for id \'' + id + '\'');
        }

        return page.data[0];
      }).catch(_errorHandler2.default);
    }

    /**
     * `get` service function for objection.
     * @param {...object} args
     * @return {Promise} - promise containing the data being retrieved
     */

  }, {
    key: 'get',
    value: function get() {
      return this._get.apply(this, arguments);
    }
  }, {
    key: '_create',
    value: async function _create(data) {
      var trx = await _objection.transaction.start(this.Model.knex());
      try {
        var result = await this.Model.query(trx).insertGraph(data, this.id).returning('*');

        await trx.commit();
        return result;
      } catch (error) {
        trx.rollback();
        (0, _errorHandler2.default)(error);
      }
    }

    /**
     * `create` service function for objection.
     * @param {object} data
     */

  }, {
    key: 'create',
    value: function create(data) {
      return this._create(data);
    }

    /**
     * `update` service function for objection.
     * @param id
     * @param data
     * @param params
     */

  }, {
    key: 'update',
    value: function update(id, data, params) {
      var _this3 = this;

      if (Array.isArray(data)) {
        return Promise.reject('Not replacing multiple records. Did you mean `patch`?');
      }

      // NOTE (EK): First fetch the old record so
      // that we can fill any existing keys that the
      // client isn't updating with null;
      return this._get(id, params).then(function (oldData) {
        var newObject = {};

        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
          for (var _iterator2 = Object.keys(oldData)[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
            var key = _step2.value;

            if (data[key] === undefined) {
              newObject[key] = null;
            } else {
              newObject[key] = data[key];
            }
          }

          // NOTE (EK): Delete id field so we don't update it
        } catch (err) {
          _didIteratorError2 = true;
          _iteratorError2 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion2 && _iterator2.return) {
              _iterator2.return();
            }
          } finally {
            if (_didIteratorError2) {
              throw _iteratorError2;
            }
          }
        }

        delete newObject[_this3.id];

        return _this3.Model.query().where(_this3.id, id).update(newObject).then(function () {
          // NOTE (EK): Restore the id field so we can return it to the client
          newObject[_this3.id] = id;
          return newObject;
        });
      }).catch(_errorHandler2.default);
    }

    /**
     * `patch` service function for objection.
     * @param id
     * @param data
     * @param params
     */

  }, {
    key: 'patch',
    value: function patch(id, raw, params) {
      var _this4 = this;

      var query = (0, _feathersQueryFilters2.default)(params.query || {}).query;
      var data = _extends({}, raw);

      var mapIds = function mapIds(page) {
        return page.data.map(function (current) {
          return current[_this4.id];
        });
      };

      // By default we will just query for the one id. For multi patch
      // we create a list of the ids of all items that will be changed
      // to re-query them after the update
      var ids = id === null ? this._find(params).then(mapIds) : Promise.resolve([id]);

      if (id !== null) {
        query[this.id] = id;
      }

      var q = this.Model.query();

      this.objectify(q, query);

      delete data[this.id];

      return ids.then(function (idList) {
        var _query;

        // Create a new query that re-queries all ids that
        // were originally changed
        var findParams = _extends({}, params, {
          query: (_query = {}, _defineProperty(_query, _this4.id, { $in: idList }), _defineProperty(_query, '$select', params.query && params.query.$select), _query)
        });

        return q.patch(data).then(function () {
          return _this4._find(findParams).then(function (page) {
            var items = page.data;

            if (id !== null) {
              if (items.length === 1) {
                return items[0];
              } else {
                throw new _feathersErrors.errors.NotFound('No record found for id \'' + id + '\'');
              }
            }

            return items;
          });
        });
      }).catch(_errorHandler2.default);
    }

    /**
     * `remove` service function for objection.
     * @param id
     * @param params
     */

  }, {
    key: 'remove',
    value: function remove(id, params) {
      var _this5 = this;

      params.query = params.query || {};

      // NOTE (EK): First fetch the record so that we can return
      // it when we delete it.
      if (id !== null) {
        params.query[this.id] = id;
      }

      return this._find(params).then(function (page) {
        var items = page.data;
        var query = _this5.Model.query();

        _this5.objectify(query, params.query);

        return query.delete().then(function () {
          if (id !== null) {
            if (items.length === 1) {
              return items[0];
            } else {
              throw new _feathersErrors.errors.NotFound('No record found for id \'' + id + '\'');
            }
          }

          return items;
        });
      }).catch(_errorHandler2.default);
    }
  }]);

  return Service;
}();

function init(options) {
  return new Service(options);
}

init.Service = Service;
module.exports = exports['default'];