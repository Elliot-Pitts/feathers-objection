import Proto from 'uberproto';
import filter from 'feathers-query-filters';
import isPlainObject from 'is-plain-object';
import errorHandler from './error-handler';
import { errors } from 'feathers-errors';
const objection = require('objection');

const METHODS = {
  $or: 'orWhere',
  $ne: 'whereNot',
  $in: 'whereIn',
  $nin: 'whereNotIn',
};

const OPERATORS = {
  $lt: '<',
  $lte: '<=',
  $gt: '>',
  $gte: '>=',
  $like: 'like',
};

const commitTransaction = async (trxOptions, knex) => {
  await trxOptions.lastActionComplete;
  const result = await objection.transaction(knex, async (trx) => {
    const promises = trxOptions.actions.map(action => action(trx));
    return Promise.all(promises);
  });
  trxOptions.trxResolver(result);
};

/**
 * Class representing an feathers adapter for objection.js ORM.
 * @param {object} options
 * @param {string} [id='id'] - database id field
 * @param {object} options.model - an objection model
 * @param {object} [options.paginate]
 * @param {string} [allowedEager] - Objection eager loading string.
 */
class Service {
  constructor (options) {
    if (!options) {
      throw new Error('Objection options have to be provided')
    }

    if (!options.model) {
      throw new Error('You must provide an Objection Model')
    }

    this.options = options || {};
    this.usesPg = options.usesPg || false;
    this.id = options.id || 'id';
    this.paginate = options.paginate || {};
    this.events = options.events || [];
    this.Model = options.model;
    this.Model.knex(options.knex);
    this.allowedEager = options.allowedEager || '[]';
    this.namedEagerFilters = options.namedEagerFilters;
    this.eagerFilters = options.eagerFilters;
    this.computedEagerFilters = options.computedEagerFilters;
  }

  extend (obj) {
    return Proto.extend(obj, this)
  }

  /**
   * Maps a feathers query to the objection/knex schema builder functions.
   * @param query - a query object. i.e. { type: 'fish', age: { $lte: 5 }
   * @param params
   * @param parentKey
   */
  objectify (query, params, parentKey) {
    Object.keys(params || {}).forEach((key) => {
      const value = params[key]

      if (isPlainObject(value)) {
        return this.objectify(query, value, key)
      }

      const column = parentKey || key
      const method = METHODS[key]
      const operator = OPERATORS[key] || '='

      if (method) {
        if (key === '$or') {
          const self = this

          return value.forEach(condition => {
            query[method](function () {
              self.objectify(this, condition)
            })
          })
        }

        return query[method].call(query, column, value) // eslint-disable-line no-useless-call
      }
      console.log('lppoppo', column, operator, value)
      return query.where(column, operator, value)
    })
  }

  createQuery (paramsQuery = {}) {
    const { filters, query } = filter(paramsQuery)
    let q = this.Model.query().skipUndefined()
      .allowEager(this.allowedEager)

    let eagerFilters = this.namedEagerFilters
    if (this.computedEagerFilters && query.$eagerFilterParams) {
      const paramEntries = Object.entries(query.$eagerFilterParams)
      paramEntries.map(paramEntry => {
        const eagerFilter = this.computedEagerFilters[paramEntry[0]]
        if (eagerFilter) {
          return [paramEntry[0], eagerFilter(paramEntry[1])]
        }
        return null
      })
        .filter(ef => ef)
        .forEach(eagerFilter => {
          eagerFilters[eagerFilter[0]] = eagerFilter[1];
        });
      delete query.$eagerFilterParams;
    }

    // $eager for objection eager queries
    let $eager
    if (query && query.$eager) {
      $eager = query.$eager
      delete query.$eager
      q.eager($eager, eagerFilters)
    }

    // $select uses a specific find syntax, so it has to come first.
    if (filters.$select) {
      q = this.Model.query().skipUndefined()
        .allowEager(this.allowedEager)
        .select(...filters.$select.concat(this.id))
        .eager($eager, eagerFilters)
    }

    // apply eager filters if specified
    if (this.eagerFilters) {
      const eagerFilters = this.eagerFilters
      if (Array.isArray(eagerFilters)) {
        for (var eagerFilter of eagerFilters) {
          q.filterEager(eagerFilter.expression, eagerFilter.filter)
        }
      } else {
        q.filterEager(eagerFilters.expression, eagerFilters.filter)
      }
    }

    // build up the knex query out of the query params
    this.objectify(q, query)

    if (filters.$sort) {
      Object.keys(filters.$sort).forEach(key => {
        q = q.orderBy(key, filters.$sort[key] === 1 ? 'asc' : 'desc')
      })
    }

    return q
  }

  _find (params, count, getFilter = filter) {
    const { filters, query } = getFilter(params.query || {})
    const q = params.objection || this.createQuery(params.query)

    // Handle $limit
    if (filters.$limit) {
      q.limit(filters.$limit)
    }

    // Handle $skip
    if (filters.$skip) {
      q.offset(filters.$skip)
    }

    let executeQuery = total => {
      return q.then(data => {
        return {
          total,
          limit: filters.$limit,
          skip: filters.$skip || 0,
          data
        }
      })
    }

    if (filters.$limit === 0) {
      executeQuery = total => {
        return Promise.resolve({
          total,
          limit: filters.$limit,
          skip: filters.$skip || 0,
          data: []
        })
      }
    }
    delete query.$eager

    if (count) {
      let countQuery = this.Model.query().skipUndefined().count(`${this.id} as total`)

      this.objectify(countQuery, query)

      return countQuery.then(count => count[0].total).then(executeQuery)
    }

    return executeQuery().catch(errorHandler)
  }

  /**
   * `find` service function for objection.
   * @param params
   */
  find (params) {
    const paginate = (params && typeof params.paginate !== 'undefined') ? params.paginate : this.paginate
    const result = this._find(params, !!paginate.default,
      query => filter(query, paginate)
    )

    if (!paginate.default) {
      return result.then(page => page.data)
    }

    return result
  }

  _get (id, params = {}) {
    const query = Object.assign({}, params.query)
    query[this.id] = id

    return this._find(Object.assign({}, params, { query }))
      .then(page => {
        if (page.data.length !== 1) {
          throw new errors.NotFound(`No record found for id '${id}'`)
        }

        return page.data[0]
      }).catch(errorHandler)
  }

  /**
   * `get` service function for objection.
   * @param {...object} args
   * @return {Promise} - promise containing the data being retrieved
   */
  get (...args) {
    return this._get(...args)
  }

  /**
   * `create` service function for objection.
   * @params {object} data
   */
  async create (data, params) {

    if (Array.isArray(data)) {
      return errorHandler(new errors.BadRequest(`Can not batch create`));
    }
    try {
      if (params.trx) {
        const createFunc = async (trx) => {
          return this.Model
            .query(trx)
            .insertGraph(data, this.id)
            .returning('*');
        };
        const actionIndex = params.trx.actions.length;
        params.trx.actions.push(createFunc);
        if (params.trx.actions.length === params.trx.actionsCount) {
          params.trx.lastActionResolver();
        }
        if (params.commitTrx) {
          await commitTransaction(params.trx, this.Model.knex());
        }
        const trxResult = await params.trx.trxCommitted;
        return trxResult[actionIndex];
      }
      else {
        return await objection.transaction(this.Model.knex(), async (trx) => {
          return await this.Model
            .query(trx)
            .insertGraph(data, this.id)
            .returning('*');
        });
      }
    } catch (error) {
      errorHandler(new errors.BadRequest(error));
    }
  }

  /**
   * `update` service function for objection.
   * @param id
   * @param data
   * @param params
   */
  update (id, data, params) {
    if (Array.isArray(data)) {
      return Promise.reject('Not replacing multiple records. Did you mean `patch`?')
    }

    // NOTE (EK): First fetch the old record so
    // that we can fill any existing keys that the
    // client isn't updating with null;
    return this._get(id, params).then(oldData => {
      let newObject = {}

      for (var key of Object.keys(oldData)) {
        if (data[key] === undefined) {
          newObject[key] = null
        } else {
          newObject[key] = data[key]
        }
      }

      // NOTE (EK): Delete id field so we don't update it
      delete newObject[this.id]

      return this.Model.query().where(this.id, id).update(newObject).then(() => {
        // NOTE (EK): Restore the id field so we can return it to the client
        newObject[this.id] = id
        return newObject
      })
    }).catch(errorHandler)
  }

  /**
   * `patch` service function for objection.
   * @param id
   * @param raw
   * @param params
   */
  async patch (id, raw, params) {
    const query = filter(params.query || {}).query;
    const data = Object.assign({}, raw);
    if (data[this.id] != null) {
      id = data[this.id]
    }
    if (id != null) {
      query[this.id] = id
    }
    const $eager = query.$eager;
    delete query.$eager;
    delete data[this.id];
    try {
      let items;
      if (params.trx) {
        const patchFunc = async (trx) => {
          let q = this.Model.query(trx)
            .returning('*');
          this.objectify(q, query);
          return q.patch(data);
        };
        const actionIndex = params.trx.actions.length;
        params.trx.actions.push(patchFunc);
        if (params.trx.actions.length === params.trx.actionsCount) {
          params.trx.lastActionResolver();
        }
        if (params.commitTrx) {
          await commitTransaction(params.trx, this.Model.knex());
        }
        const trxResult = await params.trx.trxCommitted;
        items = trxResult[actionIndex];
      }
      else {
        let q = this.Model.query();
        this.objectify(q, query);
        items = await q.patch(data)
          .returning('*');
      }
      if ($eager) {
        let ids;
        if (id) {
          ids = [id];
        } else {
          ids = items.map(obj => obj[this.id]);
        }
        const page = await this.find({
          query:
            {
              $eager,
              [this.id]: {$in: ids},
            }
        });
        items = page.data;
      }
      if (id != null) {
        if (items.length === 1) {
          return items[0]
        } else {
          errorHandler(new errors.NotFound(`No record found for id '${id}'`))
        }
      }
      return items;

    } catch (error) {
      errorHandler(new errors.BadRequest(error));
    }
  }

  /**
   * `remove` service function for objection.
   * @param id
   * @param params
   */
  async remove (id, params) {
    params.query = params.query || {};

    // NOTE (EK): First fetch the record so that we can return
    // it when we delete it.
    if (id !== null) {
      params.query[this.id] = id
    }
    try {
      let query;
      const page = await this._find(params);
      const items = page.data;

      if (params.trx) {
        console.log('DELETE-----------');
        const deleteFunc = async (trx) => {
          query = this.Model.query(trx);
          this.objectify(query, params.query);
          return query.delete();
        };
        const actionIndex = params.trx.actions.length;
        params.trx.actions.push(deleteFunc);
        if (params.trx.actions.length === params.trx.actionsCount) {
          params.trx.lastActionResolver();
        }
        if (params.commitTrx) {
          await commitTransaction(params.trx, this.Model.knex());
        }
        const trxResult = await params.trx.trxCommitted;
        return trxResult[actionIndex];
      } else {
        query = this.Model.query();
        this.objectify(query, params.query);
        await query.delete();
        if (id !== null) {
          if (items.length === 1) {
            return items[0]
          } else {
            errorHandler(new errors.NotFound(`No record found for id '${id}'`));
          }
        }
        return items
      }
    } catch (err) {
      errorHandler(new errors.BadRequest(err));
    }
  }
}

export default function init (options) {
  return new Service(options)
}

init.Service = Service
