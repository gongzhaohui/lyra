/* eslint new-cap:0 */
'use strict';

var Immutable = require('immutable'),
    ACTIONS = require('../actions/Names'),
    immutableUtils = require('../util/immutable-utils'),
    set = immutableUtils.set;

/**
 * Main pipelines reducer function, which generates a new state for the
 * pipelines property store based on the changes specified by the dispatched
 * action object.
 *
 * @param {Object} state - An Immutable.Map state object
 * @param {Object} action - A redux action object
 * @returns {Object} A new Immutable.Map with the changes specified by the action
 */
function pipelinesReducer(state, action) {
  if (typeof state === 'undefined') {
    return Immutable.Map();
  }

  if (action.type === ACTIONS.ADD_PIPELINE) {
    return set(state, action.id, Immutable.fromJS(action.props));
  }

  return state;
}

module.exports = pipelinesReducer;
