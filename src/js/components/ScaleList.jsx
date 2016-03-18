'use strict';
var React = require('react'),
    connect = require('react-redux').connect,
    ContentEditable = require('./ContentEditable');

function mapStateToProps(reduxState, ownProps) {
  return {
    selected: reduxState.get('selectedMark')
  };
}

var ScaleList = connect(
  mapStateToProps
)(React.createClass({
  propTypes: {
    select: React.PropTypes.func,
    selected: React.PropTypes.number
  },

  select: function(id) {
    this.props.select(id);
  },

  render: function() {
    var props = this.props,
        selected = props.selected;
    return (
      <div id="scale-list">
        <h2>Scales <i className="fa fa-plus"></i></h2>
        <ul>
          {props.scales.map(function(scale) {
            var id = scale._id,
                select = this.select.bind(this, id);
            return (
              <li key={id} className={selected === id ? 'selected' : ''}
                onClick={select}>
                <div className="scale">
                  <ContentEditable obj={scale} prop="name"
                    value={scale.name}
                    onClick={select} />
                </div>
              </li>
            );
          }, this)}
        </ul>
      </div>
    );
  }
}));

module.exports = ScaleList;
