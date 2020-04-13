'use strict';

import * as React from 'react';
import {connect} from 'react-redux';
import {State} from '../../store';
import {InteractionRecord, ApplicationRecord, SelectionRecord, ScaleInfo, MarkApplicationRecord, PointSelectionRecord, IntervalSelectionRecord, IntervalSelection, PointSelection, MarkApplication, ScaleApplication, TransformApplication, InteractionInput} from '../../store/factory/Interaction';
import {GroupRecord} from '../../store/factory/marks/Group';
import {setInput, setSelection, setApplication, removeApplication} from '../../actions/interactionActions';
import {getScaleInfoForGroup, ScaleSimpleType} from '../../ctrl/demonstrations';
import {DatasetRecord} from '../../store/factory/Dataset';
import {InteractionMarkApplicationProperty} from './InteractionMarkApplication';
import {MarkRecord, LyraMarkType} from '../../store/factory/Mark';
import exportName from '../../util/exportName';
import InteractionPreview from '../interactions/InteractionPreview';
import {Map} from 'immutable';
import {DraggingStateRecord, SignalDraggingState, SignalDraggingStateRecord} from '../../store/factory/Inspector';
import {startDragging, stopDragging} from '../../actions/inspectorActions';
import {setMarkVisual} from '../../actions/markActions';
import sg from '../../ctrl/signals';
import {CELL, MODE, SELECTED} from '../../store/factory/Signal';
import {NumericValueRef, StringValueRef, tupleid, debounce} from 'vega';
import {InteractionInputType} from './InteractionInputType';
import {WidgetSelectionRecord, WidgetRecord, WidgetSelection, WidgetComparator} from '../../store/factory/Widget';

const ctrl = require('../../ctrl');
const listeners = require('../../ctrl/listeners');

interface OwnProps {
  primId: number;
}

interface DispatchProps {
  setSelection: (record: WidgetSelectionRecord, id: number) => void;
  setApplication: (record: MarkApplicationRecord, id: number) => void;
  removeApplication: (record: MarkApplicationRecord, id: number) => void;
  startDragging: (d: DraggingStateRecord) => void;
  stopDragging: () => void;
  setMarkVisual: (payload: {property: string, def: NumericValueRef | StringValueRef}, markId: number) => void;
}

interface StateProps {
  groups: Map<number, GroupRecord>;
  widget: WidgetRecord;
  scaleInfo: ScaleInfo;
  datasets: Map<string, DatasetRecord>;
  group: GroupRecord;
  groupName: string;
  marksOfGroups: Map<number, MarkRecord[]>; // map of group ids to array of mark specs
  fieldsOfGroup: string[];
  canDemonstrate: boolean;
  selectionPreviews: WidgetSelectionRecord[];
  applicationPreviews: MarkApplicationRecord[];
  dragging: SignalDraggingStateRecord;
}

function mapStateToProps(state: State, ownProps: OwnProps): StateProps {
  const widget: WidgetRecord = state.getIn(['vis', 'present', 'widgets',  String(ownProps.primId)]);
  const groupId = widget.get('groupId');
  const scaleInfo: ScaleInfo = getScaleInfoForGroup(state, groupId);
  const group: GroupRecord = state.getIn(['vis', 'present', 'marks', String(groupId)]);
  const groupName = exportName(group.name);

  const marks: Map<string, MarkRecord> = state.getIn(['vis', 'present', 'marks']);
  const groups: Map<number, GroupRecord> = marks.filter((mark: MarkRecord) => {
    return mark.type === 'group';
  }).mapEntries(([k, v]) => {
    return [Number(k), v as GroupRecord];
  });

  const marksOfGroups: Map<number, MarkRecord[]> = groups.map(group => {
    return group.marks.map(markId => {
      return state.getIn(['vis', 'present', 'marks', String(markId)]);
    }).filter((mark) => {
      return !(mark.type === 'group' || mark.name.indexOf('lyra') === 0);
    });
  });

  const marksOfGroup = marksOfGroups.get(groupId);

  const datasets: Map<string, DatasetRecord> = state.getIn(['vis', 'present', 'datasets']);

  let fieldsOfGroup = [];
  if (marksOfGroup.length && marksOfGroup[0].from && marksOfGroup[0].from.data) {
    const dsId = String(marksOfGroup[0].from.data);
    const dataset: DatasetRecord =  datasets.get(dsId);
    const schema = dataset.get('_schema');
    const fields = schema.keySeq().toArray();
    fieldsOfGroup = fields;
  }
  const isParsing = state.getIn(['vega', 'isParsing']);

  const canDemonstrate = Boolean(!isParsing && ctrl.view && (scaleInfo.xScaleName && scaleInfo.xFieldName || scaleInfo.yScaleName && scaleInfo.yFieldName));

  const {
    selectionPreviews,
    applicationPreviews,
  } = generatePreviews(groupId, marksOfGroups, widget);

  const draggingSignal = state.getIn(['inspector', 'dragging']) as SignalDraggingStateRecord;
  const dragging = draggingSignal && draggingSignal.signal ? draggingSignal : null;

  return {
    widget: widget,
    groups,
    scaleInfo,
    group,
    groupName,
    datasets,
    marksOfGroups,
    fieldsOfGroup,
    canDemonstrate,
    selectionPreviews,
    applicationPreviews,
    dragging
  };
}

const actionCreators = {setInput, setSelection, setApplication, removeApplication, startDragging, stopDragging, setMarkVisual};

function generatePreviews(groupId, marksOfGroups, widget): {
  selectionPreviews: WidgetSelectionRecord[],
  applicationPreviews: MarkApplicationRecord[]
} {
  const marksOfGroup = marksOfGroups.get(groupId);

  return { // TODO maybe memoize these calls or something? also memoize the signal setters
    selectionPreviews: generateSelectionPreviews(widget),
    applicationPreviews: generateApplicationPreviews(marksOfGroup)
  };
};

function generateSelectionPreviews(widget: WidgetRecord): WidgetSelectionRecord[] {
  if (widget.field.mtype === 'nominal' || widget.field.mtype === 'ordinal') {
    return [
      WidgetSelection({
        type: 'radio',
        id: 'radio',
        label: 'Radio buttons',
        comparator: '=='
      }),
      WidgetSelection({
        type: 'select',
        id: 'select',
        label: 'Select dropdown',
        comparator: '=='
      }),
    ]
  }
  else if (widget.field.mtype === 'temporal' || widget.field.mtype === 'quantitative') {
    return [
      WidgetSelection({
        type: 'range',
        id: 'range',
        label: 'Range slider',
        step: 1, // TODO
        comparator: '=='
      })
    ]
  }
  else {
    // geojson?
  }
}

function generateApplicationPreviews(marksOfGroup: MarkRecord[]): MarkApplicationRecord[] {
  const defs: MarkApplicationRecord[] = [];

  if (marksOfGroup.length) {
    const mark = marksOfGroup[0];
    defs.push(MarkApplication({
      id: "color",
      label: "Color",
      targetMarkName: exportName(mark.name),
      propertyName: "fill",
      unselectedValue: "#797979"
    }));
    defs.push(MarkApplication({
      id: "opacity",
      label: "Opacity",
      targetMarkName: exportName(mark.name),
      propertyName: "opacity",
      unselectedValue: "0.2"
    }));
    if (mark.type === 'symbol') {
      defs.push(MarkApplication({
        id: "size",
        label: "Size",
        targetMarkName: exportName(mark.name),
        propertyName: "size",
        unselectedValue: 30
      }));
    }
  }

  return defs;
}

class BaseWidgetInspector extends React.Component<OwnProps & StateProps & DispatchProps> {

  public componentDidUpdate(prevProps: OwnProps & StateProps, prevState) {
    if (!prevProps.canDemonstrate && this.props.canDemonstrate) {
      // this.restoreMainViewSignals(this.props.groupName);
      // this.restorePreviewSignals();

      // this.onSignal(this.props.groupName, this.scopedSignalName('points_tuple'), (name, value) => this.onMainViewPointSignal(name, value));
      // this.onSignal(this.props.groupName, this.scopedSignalName('points_tuple_projected'), (name, value) => this.onMainViewPointSignal(name, value));
      // this.onSignal(this.props.groupName, this.scopedSignalName('points_toggle'), (name, value) => this.onMainViewPointSignal(name, value));
      // this.onSignal(this.props.groupName, this.scopedSignalName('brush_x'), (name, value) => this.onMainViewIntervalSignal(name, value));
      // this.onSignal(this.props.groupName, this.scopedSignalName('brush_y'), (name, value) => this.onMainViewIntervalSignal(name, value));
      // this.onSignal(this.props.groupName, this.scopedSignalName('grid_translate_anchor'), (name, value) => this.onMainViewGridSignal(name, value));
      // this.onSignal(this.props.groupName, this.scopedSignalName('grid_translate_delta'), (name, value) => this.onMainViewGridSignal(name, value));
    }

    if (prevProps.selectionPreviews !== this.props.selectionPreviews && this.props.selectionPreviews.length) {
      const selectionIds = this.props.selectionPreviews.map(s => s.id);
      if (!this.props.widget.selection ||
          selectionIds.every(id => id !== this.props.widget.selection.id)) {
            this.props.setSelection(this.props.selectionPreviews[0], this.props.widget.id);
      }
    }
  }

  private scopedSignalName(signalName: string) {
    return `${signalName}_${this.props.widget.id}`
  }

  private restoreMainViewSignals(groupName) {
    for (let signalName of ['brush_x', 'brush_y', 'points_tuple', 'points_tuple_projected'].map(s => this.scopedSignalName(s))) {
      if (this.mainViewSignalValues[signalName]) {
        listeners.setSignalInGroup(ctrl.view, groupName, signalName, this.mainViewSignalValues[signalName]);
      }
    }
  }

  private restorePreviewSignals() {
    for (let signalName of ['brush_x', 'brush_y', 'points_tuple', 'points_tuple_projected'].map(s => this.scopedSignalName(s))) {
      if (this.mainViewSignalValues[signalName]) {
        setTimeout(() => {
          this.updatePreviewSignals(signalName, this.mainViewSignalValues[signalName]);
        }, 50);
        // somehow it only works if you have both of these??? some kind of vega invalidation thing
        this.updatePreviewSignals(signalName, this.mainViewSignalValues[signalName]);
      }
    }
  }

  private previewRefs = {}; // id -> ref
  private mainViewSignalValues = {}; // name -> value

  private updatePreviewSignals(name, value) {
    this.props.selectionPreviews.forEach(preview => {
      if (this.previewRefs[preview.id]) {
        this.previewRefs[preview.id].setPreviewSignal(name, value);
      }
    });
    this.props.applicationPreviews.forEach(preview => {
      if (this.previewRefs[preview.id]) {
        this.previewRefs[preview.id].setPreviewSignal(name, value);
      }
    });
  }
  private onSignal(groupName, signalName, handler) {
    listeners.onSignalInGroup(ctrl.view, groupName, signalName, handler);
  }

  private onClickWidgetPreview(preview: WidgetSelectionRecord) {
    if (this.props.widget) {
      this.props.setSelection(preview, this.props.widget.id);
    }
  }

  private onClickApplicationPreview(preview: MarkApplicationRecord) {
    if (this.props.widget) {
      if (this.widgetHasApplication(preview)) {
        this.props.removeApplication(preview, this.props.widget.id);
      }
      else {
        this.props.setApplication(preview, this.props.widget.id);
      }
    }
  }

  private widgetHasApplication(preview: MarkApplicationRecord) {
    return this.props.widget.applications.some(application => application.id === preview.id);
  }

  private getComparatorOptions(preview: WidgetSelectionRecord) {
    const options = ['==', '<', '>', '<=', '>='].map(comparator => <option key={comparator} value={comparator}>{comparator}</option>);

    return (
      <div className="property">
        <label htmlFor='widget_comparator'>Comparator:</label>
        <div className='control'>
          <select name='widget_comparator' value={preview.comparator} onChange={e => this.onSelectComparator(preview, e.target.value as WidgetComparator)}>
            {options}
          </select>
        </div>
      </div>
    );
  }
  private onSelectComparator(preview: WidgetSelectionRecord, comparator: WidgetComparator) {
    const newPreview = preview.set('comparator', comparator);
    this.props.setSelection(newPreview, this.props.widget.id);
  }

  private getTargetMarkOptions(preview: MarkApplicationRecord) {
    const marksOfGroup = this.props.marksOfGroups.get(this.props.group._id);

    if (marksOfGroup.length === 1) {
      return null;
    }

    const options = marksOfGroup.map(mark => {
      const markName = exportName(mark.name);
      return <option key={markName} value={markName}>{markName}</option>
    });

    return (
      <div className="property">
        <label htmlFor='target_mark'>Target Mark:</label>
        <div className='control'>
          <select name='target_mark' value={preview.targetMarkName} onChange={e => this.onSelectTargetMarkName(preview, e.target.value)}>
            {options}
          </select>
        </div>
      </div>
    );
  }

  private onSelectTargetMarkName(preview: MarkApplicationRecord, targetMarkName: string) {
    const newPreview = preview.set('targetMarkName', targetMarkName);
    this.props.setApplication(newPreview, this.props.widget.id);
  }
  // private getSignalBubbles(scaleInfo: ScaleInfo, input: InteractionInput) {
  //   if (!input) return;
  //   const {xScaleName, yScaleName, xFieldName, yFieldName} = scaleInfo;

  //   const signals = [];

  //   const handleDragStart = (evt) => {
  //     const groupId = this.props.group._id;
  //     const signal = evt.target.dataset.signal;

  //     this.props.startDragging(SignalDraggingState({groupId, signal}));

  //     sg.set(MODE, 'channels');
  //     ctrl.update();
  //   }

  //   const handleDragEnd = () => {
  //     const sel = sg.get(SELECTED);
  //     const cell = sg.get(CELL);
  //     const dropped = tupleid(sel) && tupleid(cell);

  //     try {
  //       if (dropped) {
  //         const lyraId = +sel.mark.role.split('lyra_')[1]; // id of thing that was dropped onto
  //         const channel: string = cell.key;
  //         this.props.setMarkVisual(
  //           {
  //             property: channel,
  //             def: {signal: channel === 'text' ? `{{#${this.props.dragging.signal}}}` : this.props.dragging.signal}
  //           },
  //           lyraId
  //         )
  //       }
  //     } catch (e) {
  //       console.error('Unable to bind primitive');
  //       console.error(e);
  //     }

  //     this.props.stopDragging();
  //     sg.set(MODE, 'handles');
  //     sg.set(CELL, {});

  //     if (!dropped) {
  //       ctrl.update();
  //     }
  //   }

  //   const interactionId = this.props.widget.id;

  //   switch (input.mouse) {
  //     case 'drag':
  //       if (xScaleName) {
  //         signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`brush_x_start_${interactionId}`}>brush_x (start)</div>)
  //         signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`brush_x_end_${interactionId}`}>brush_x (end)</div>)
  //       }
  //       if (yScaleName) {
  //         signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`brush_y_start_${interactionId}`}>brush_y (start)</div>)
  //         signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`brush_y_end_${interactionId}`}>brush_y (end)</div>)
  //       }
  //       // TODO create these signals
  //       // if (xFieldName) {
  //       //   signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`brush_${xFieldName}_${xScaleName}_${interactionId}_start`}>{`brush_${xFieldName} (start)`}</div>)
  //       //   signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`brush_${xFieldName}_${xScaleName}_${interactionId}_end`}>{`brush_${xFieldName} (end)`}</div>)
  //       // }
  //       // if (yFieldName) {
  //       //   signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`brush_${yFieldName}_${yScaleName}_${interactionId}_start`}>{`brush_${yFieldName} (start)`}</div>)
  //       //   signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`brush_${yFieldName}_${yScaleName}_${interactionId}_end`}>{`brush_${yFieldName} (end)`}</div>)
  //       // }
  //       break;
  //       case 'click':
  //         signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`lyra_points_tuple_${interactionId}`}>points</div>); // TODO: how do people actually use this?
  //         break;
  //       case 'mouseover':
  //         signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`mouse_x_${interactionId}`}>mouse_x</div>);
  //         signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`mouse_y_${interactionId}`}>mouse_y</div>);
  //         signals.push(<div draggable className="signal" onDragStart={handleDragStart} onDragEnd={handleDragEnd} data-signal={`lyra_points_tuple_${interactionId}`}>points</div>); // TODO: how do people actually use this?
  //         break;
  //   }
  //   return signals;
  // }

  public render() {
    const interaction = this.props.widget;
    const applications = interaction.applications;

    return (
      <div>
        <div>
          <div className={"preview-controller"}>
            <div className='property-group'>
              <h3>Selections</h3>
              <div className="preview-scroll">
                {
                  this.props.selectionPreviews.map((preview) => {
                    return (
                      <div key={preview.id} className={interaction && interaction.selection && interaction.selection.id === preview.id ? 'selected' : ''}
                          onClick={() => this.onClickWidgetPreview(preview)}>
                        <div className="preview-label">{preview.label}</div>
                        {/*  */}
                      </div>
                    )
                  })
                }
              </div>
              {
                (interaction && interaction.selection) ? (
                  this.getComparatorOptions(interaction.selection)
                ) : null
              }
            </div>
            <div className='property-group'>
              <h3>Applications</h3>
              <div className="preview-scroll">
                {
                  this.props.applicationPreviews.map((preview) => {
                    return (
                      <div key={preview.id} className={interaction && this.widgetHasApplication(preview) ? 'selected' : ''}>
                        <div onClick={() => this.onClickApplicationPreview(preview)}>
                          <div className="preview-label">{preview.label}</div>
                          {/*  */}
                        </div>
                      </div>
                    )
                  })
                }
              </div>
              {
                applications.map(application => {
                  return application.type === 'mark' ? (
                    <div>
                      {this.getTargetMarkOptions(application as MarkApplicationRecord)}
                      <InteractionMarkApplicationProperty interactionId={interaction.id} groupId={interaction.groupId} markApplication={application as MarkApplicationRecord}></InteractionMarkApplicationProperty>
                    </div>
                  ) : null
                })
              }
            </div>
          </div>
          <div className="property-group">
            <h3>Signals</h3>
            <div className='signals-container'>
              {/* {this.getSignalBubbles(this.props.scaleInfo, interaction.input)} */}
            </div>
          </div>
        </div>
      </div>
    );
  }
};

export const WidgetInspector = connect(mapStateToProps, actionCreators)(BaseWidgetInspector);
