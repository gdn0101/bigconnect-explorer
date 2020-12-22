/*
 * This file is part of the BigConnect project.
 *
 * Copyright (c) 2013-2020 MWARE SOLUTIONS SRL
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License version 3
 * as published by the Free Software Foundation with the addition of the
 * following permission added to Section 15 as permitted in Section 7(a):
 * FOR ANY PART OF THE COVERED WORK IN WHICH THE COPYRIGHT IS OWNED BY
 * MWARE SOLUTIONS SRL, MWARE SOLUTIONS SRL DISCLAIMS THE WARRANTY OF
 * NON INFRINGEMENT OF THIRD PARTY RIGHTS
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License
 * along with this program; if not, see http://www.gnu.org/licenses or write to
 * the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor,
 * Boston, MA, 02110-1301 USA, or download the license from the following URL:
 * https://www.gnu.org/licenses/agpl-3.0.txt
 *
 * The interactive user interfaces in modified source and object code versions
 * of this program must display Appropriate Legal Notices, as required under
 * Section 5 of the GNU Affero General Public License.
 *
 * You can be released from the requirements of the license by purchasing
 * a commercial license. Buying such a license is mandatory as soon as you
 * develop commercial activities involving the BigConnect software without
 * disclosing the source code of your own applications.
 *
 * These activities include: offering paid services to customers as an ASP,
 * embedding the product in a web application, shipping BigConnect with a
 * closed source product.
 */
define([
    'flight/lib/component',
    'd3',
    'util/withDataRequest',
    'util/requirejs/promise!util/service/ontologyPromise',
    './aggregationTpl.hbs'
], function(
    defineComponent,
    d3,
    withDataRequest,
    ontology,
    template) {
    'use strict';

    const DATA_TYPE_NUMBERS = ['integer', 'decimal', 'double', 'number', 'currency']

    const AGGREGATIONS = [
            {
                value: 'term',
                name: i18n('dashboard.savedsearches.aggregation.type.counts'),
                dataTypes: ['date', 'boolean', 'string', ...DATA_TYPE_NUMBERS]
            },
            {
                value: 'histogram',
                name: i18n('dashboard.savedsearches.aggregation.type.histogram'),
                dataTypes: ['date', ...DATA_TYPE_NUMBERS]
            },
            {
                value: 'geohash',
                name: i18n('dashboard.savedsearches.aggregation.type.geo'),
                dataTypes: ['geoLocation']
            }
        ],
        SUB_AGGREGATIONS = [
            {
                value: 'term',
                name: i18n('dashboard.savedsearches.aggregation.type.counts'),
                dataTypes: ['date', 'boolean', 'string', ...DATA_TYPE_NUMBERS]
            },
            {
                value: 'sum',
                name: i18n('dashboard.savedsearches.aggregation.type.sum'),
                dataTypes: [...DATA_TYPE_NUMBERS]
            },
            {
                value: 'avg',
                name: i18n('dashboard.savedsearches.aggregation.type.avg'),
                dataTypes: [...DATA_TYPE_NUMBERS]
            },
            {
                value: 'min',
                name: i18n('dashboard.savedsearches.aggregation.type.min'),
                dataTypes: [...DATA_TYPE_NUMBERS]
            },
            {
                value: 'max',
                name: i18n('dashboard.savedsearches.aggregation.type.max'),
                dataTypes: [...DATA_TYPE_NUMBERS]
            }
        ],
        INTERVAL_UNITS = [
            { value: 1000 * 60, label: 'minutes' },
            { value: 1000 * 60 * 60, label: 'hours' },
            { value: 1000 * 60 * 60 * 24, label: 'days' },
            { value: 1000 * 60 * 60 * 24 * 365, label: 'years' }
        ],
        HISTOGRAM_CALCULATED_BUCKETS = 20,
        PRECISIONS = [
            { value: 1, label: i18n('dashboard.savedsearches.aggregation.geo.precision.1') },
            { value: 2, label: i18n('dashboard.savedsearches.aggregation.geo.precision.2') },
            { value: 3, label: i18n('dashboard.savedsearches.aggregation.geo.precision.3') },
            { value: 4, label: i18n('dashboard.savedsearches.aggregation.geo.precision.4') },
            { value: 5, label: i18n('dashboard.savedsearches.aggregation.geo.precision.5'), selected: true },
            { value: 6, label: i18n('dashboard.savedsearches.aggregation.geo.precision.6') },
            { value: 7, label: i18n('dashboard.savedsearches.aggregation.geo.precision.7') },
            { value: 8, label: i18n('dashboard.savedsearches.aggregation.geo.precision.8') }
        ],
        defaultInterval = 20,
        defaultSize = 10;
    var idIncrement = 1;

    return defineComponent(Aggregation, withDataRequest);

    function datumToDisplayName(d) {
        if(!d || !d.field) {
            return "";
        } else {
            return ontology.properties.byTitle[d.field].displayName;
        }
    }

    function Aggregation() {

        this.attributes({
            aggregationSelector: 'select.aggregation',
            addSelector: '.add-aggregation',
            formSelector: '.form',
            inputsSelector: '.agg .interval, .agg .precision, .agg .size, .agg .excluded, .agg .orderBy',
            termSizeSelector: '.term .size',
            termExcludedSelector: '.term .excluded',
            histogramIntervalSelector: '.histogram .interval',
            histogramDateIntervalSelector: '.histogram .date_interval',
            histogramIntervalUnitsSelector: '.histogram .interval_units',
            histogramIntervalValueSelector: '.histogram .interval_value',
            aggregations: []
        })

        this.after('initialize', function() {
            this.on('change', {
                aggregationSelector: this.onChangeAggregation,
                inputsSelector: this.onChangeInputs,
                histogramDateIntervalSelector: this.onChangeInputs
            })

            this.on('keyup', {
                inputsSelector: this.onKeyup,
                histogramDateIntervalSelector: this.onKeyup
            });

            this.on('click', {
                addSelector: this.onAdd
            })

            this.on('propertyselected', this.onPropertySelected);
            this.on('filterProperties', this.onFilterProperties);

            this.aggregations = (this.attr.aggregations || []).map(function addId(a) {
                if (!a.id) a.id = idIncrement++;
                if (_.isArray(a.nested)) {
                    a.nested = a.nested.map(addId);
                }
                return a;
            });

            this.currentAggregation = null;
            this.updateAggregations(null, true);

            this.$node.html(template({
                aggregations: AGGREGATIONS,
                precisions: PRECISIONS,
                intervalUnits: INTERVAL_UNITS
            }));
        });

        this.onChangeInputs = function(event, data) {
            var $target = $(event.target), val, save = true;
            if ($target.is('.precision')) {
                this.currentAggregation.precision = $target.val();
            } else if ($target.is('.interval')) {
                this.currentAggregation.interval = $target.val();
            } else if ($target.is('.interval_value')) {
                val = parseInt($target.val(), 10) || defaultInterval;
                this.currentAggregation.interval = String(val * parseInt(this.select('histogramIntervalUnitsSelector').val(), 10));
            } else if ($target.is('.interval_units')) {
                val = parseInt(this.select('histogramIntervalValueSelector').val(), 10) || defaultInterval;
                this.currentAggregation.interval = String(parseInt($target.val(), 10) * val);
            } else if($target.is('.size')) {
                val = parseInt(this.select('termSizeSelector').val(), 10) || defaultSize;
                this.currentAggregation.size = String(val);
            } else if($target.is('.excluded')) {
                this.currentAggregation.excluded = String($target.val());
            } else if($target.is('.orderBy')) {
                this.currentAggregation.orderBy = String($target.val())
            }
            if (save) {
                this.save();
            }
        };

        this.onKeyup = function(event) {
            if (event.which === 13 && this.currentAggregation && this.currentAggregation.field) {
                this.save();
            }
        };

        this.onAdd = function(event) {
            if (!$(event.target).is(':visible')) return;

            if (_.isEmpty(this.aggregations)) {
                this.add({ type: '' });
            } else {
                this.add({ parentAggregation: this.aggregations[0] });
            }
        };

        this.add = function(aggregationToEdit) {
            if (this.currentAggregation) {
                this.select('addSelector').text('Add');
                this.currentAggregation = null;
                this.select('formSelector').hide();
                this.updateAggregations()
            } else {
                this.currentAggregation = aggregationToEdit;
                this.select('addSelector').text(i18n('dashboard.savedsearches.button.cancel')).show();
                this.select('formSelector').show();
                var aggregationField = this.select('aggregationSelector');
                if (aggregationToEdit.parentAggregation) {
                    // replace options with sub-aggregations
                    aggregationField.empty();
                    SUB_AGGREGATIONS.forEach(agg => {
                        aggregationField.append(`<option value="${agg.value}">${agg.name}</option>`)
                    })
                } else {
                    // replace options with aggregations
                    aggregationField.empty();
                    AGGREGATIONS.forEach(agg => {
                        aggregationField.append(`<option value="${agg.value}">${agg.name}</option>`)
                    })
                }
                this.updateAggregationDependents(this.currentAggregation.type || aggregationField.val());
            }

        };

        this.replaceObjectInListWithObject = function(list, newObject) {
            var existing = newObject.id && _.findWhere(list, { id: newObject.id }),
                replaced = false,
                index = existing && _.indexOf(list, existing);

            if (index >= 0) {
                list.splice(index, 1, newObject);
                replaced = true;
            }

            if (!replaced) {
                list.push(newObject);
            }
        };

        this.save = function() {
            var parentAggregation = this.currentAggregation.parentAggregation;
            if (parentAggregation) {
                parentAggregation.nested = parentAggregation.nested || [];
                this.currentAggregation.name = this.currentAggregation.field;
                this.replaceObjectInListWithObject(parentAggregation.nested, this.currentAggregation);
            } else {
                this.replaceObjectInListWithObject(this.aggregations, this.currentAggregation);
            }

            if (!this.currentAggregation.id) {
                this.currentAggregation.id = idIncrement++;
            }
            if (this.currentAggregation.type === 'histogram') {
                this.currentAggregation.minDocumentCount = 0;
            }
            this.currentAggregation = null;
            this.select('formSelector').hide();
            this.select('addSelector').text('Add');
            this.updateAggregations();
        }

        this.onPropertySelected = function(event, data) {
            var self = this;

            if (!data.property) {
                this.$node.find('.property-select').trigger('selectProperty');
                return;
            }
            this.currentAggregation.field = data.property.title;
            this.currentAggregation.name = 'field';
            if (this.currentAggregation.type === 'histogram') {
                var $interval = this.select('histogramIntervalSelector'),
                    $intervalUnits = this.select('histogramIntervalUnitsSelector'),
                    $intervalValue = this.select('histogramIntervalValueSelector'),
                    $dateInterval = this.select('histogramDateIntervalSelector');

                this.loadStatsForAggregation(this.currentAggregation)
                    .done(function(stats) {
                        var range = stats.max - stats.min,
                            buckets = range / HISTOGRAM_CALCULATED_BUCKETS,
                            ontologyProperty = ontology.properties.byTitle[stats.field],
                            isDate = ontologyProperty && ontologyProperty.dataType === 'date',
                            interval = Math.round(buckets);

                        if (isDate) {
                            var minuteInterval = INTERVAL_UNITS[0].value;
                            self.currentAggregation.isDate = true;
                            interval = interval < minuteInterval ? minuteInterval : interval;
                            $intervalUnits.val(minuteInterval);
                        }
                        $interval.val(interval);
                        $interval.toggle(!isDate);
                        $dateInterval.toggle(isDate);

                        self.currentAggregation.interval = String(interval);
                        self.save();
                    });
            } else {
                this.save();
            }
        };

        this.loadStatsForAggregation = function(aggregation) {
            var self = this;

            return new Promise(function(f, r) {
                self.off('aggregationStatistics');
                self.on('aggregationStatistics', function(event, data) {
                    self.off('aggregationStatistics');
                    if (data.success && data.statistics.field === aggregation.field) {
                        f(data.statistics);
                    } else {
                        r()
                    }
                })
                self.trigger('statisticsForAggregation', {
                    aggregation: aggregation
                });
            });
        };

        this.onChangeAggregation = function(event) {
            var aggregation = $(event.target).val();
            this.updateAggregationDependents(aggregation);
        };

        this.editAggregation = function(aggregation) {
            this.currentAggregation = null;
            this.add(aggregation);
        };

        this.updateAggregations = function(d3) {
            var self = this;

            if (!d3) {
                var args = _.toArray(arguments);
                return require(['d3'], function(d3) {
                    args.splice(0, 1, d3);
                    self.updateAggregations.apply(self, args);
                });
            }

            d3.select(this.$node.find('ul.aggregations')[0])
                .selectAll('li')
                .data(this.aggregations)
                .call(function() {
                    this.enter().append('li').style({ 'flex-wrap': 'wrap', display: 'flex'})
                        .call(function() {
                            this.append('span')
                                .style({flex: 1, cursor: 'pointer'})
                                .on('click', self.editAggregation.bind(self));
                            this.append('button').attr('class', 'remove-icon')
                                .on('click', function() {
                                    self.aggregations.splice($(d3.event.target).closest('li').index(), 1);
                                    _.defer(function() {
                                        self.updateAggregations(d3);
                                    })
                                })
                            this.append('ul').style({
                                flex: '1 0 100%',
                                margin: 0,
                                padding: 0
                            })
                        })
                    this.exit().remove();
                    this.select('span').text(datumToDisplayName)
                })
                .select('ul')
                .selectAll('li')
                .data(function(d) {
                    return d.nested || [];
                })
                .call(function() {
                    this.enter().append('li').style('display', 'flex')
                        .call(function() {
                            this.append('span')
                                .style({ flex: 1, 'padding-left': '2em', cursor: 'pointer'})
                                .on('click', function(aggregation) {
                                    var parentAggregation = self.aggregations[$(d3.event.target).closest('li').parent().closest('li').index()];
                                    aggregation.parentAggregation = parentAggregation;
                                    self.editAggregation(aggregation);
                                });
                            this.append('button').attr('class', 'remove-icon')
                                .on('click', function() {
                                    var nestedLi = $(d3.event.target).closest('li'),
                                        li = nestedLi.parent().closest('li'),
                                        nestedIndex = nestedLi.index(),
                                        index = li.index();

                                    self.aggregations[index].nested.splice(nestedIndex, 1);
                                    _.defer(function() {
                                        self.updateAggregations(d3);
                                    })
                                })
                        });
                    this.exit().remove();
                    this.select('span').text(datumToDisplayName)
                })

            this.select('addSelector').toggle(this.aggregations.length === 0 || (
                _.isEmpty(this.aggregations[0].nested) && _.contains(['term'/*, 'histogram'*/], this.aggregations[0].type)
            ));

            this.trigger('aggregationsUpdated', {
                aggregations: this.aggregations.map(function(a) {
                    if (_.isArray(a.nested)) {
                        var clone = _.extend({}, a);
                        a.nested = a.nested.map(function(c) {
                            return _.omit(c, 'parentAggregation');
                        });
                    }
                    return a;
                })
            })
        };

        this.updateAggregationDependents = function(type) {
            var section = this.$node.find('.' + type).show(),
                others = section.siblings('div').hide(),
                aggregation = this.currentAggregation,
                placeholder;

            this.currentAggregation.type = type;

            switch (type) {
                case 'geohash':
                    if (!aggregation.precision) {
                        aggregation.precision = '5';
                    }

                    section.find('.precision').val(aggregation.precision);
                    placeholder = i18n('dashboard.search.aggregation.geohash.property.placeholder');
                    break;

                case 'histogram':
                    if (!aggregation.interval) {
                        aggregation.interval = String(defaultInterval);
                    }

                    var ontologyProperty = ontology.properties.byTitle[this.currentAggregation.field],
                        isDate = !!ontologyProperty && ontologyProperty.dataType === 'date',
                        $interval = section.find('.interval').toggle(!isDate);

                    section.find('.date_interval').toggle(isDate);
                    $interval.val(aggregation.interval);
                    if (isDate) {
                        var interval = parseInt(aggregation.interval, 10),
                            intervalUnitIndex = -1;

                        for (var i = 0; i < INTERVAL_UNITS.length; i++) {
                            if (interval < INTERVAL_UNITS[i].value) {
                                intervalUnitIndex = i;
                                break;
                            }
                        }
                        var intervalUnit = intervalUnitIndex === -1 ?
                            _.last(INTERVAL_UNITS) :
                            INTERVAL_UNITS[Math.max(0, intervalUnitIndex - 1)];

                        section.find('.interval_value').val(Math.round(interval / intervalUnit.value));
                        section.find('.interval_units').val(intervalUnit.value);
                    }
                    break;

                case 'term':
                    if (!aggregation.size) {
                        aggregation.size = String(defaultSize);
                    }

                    var $size = section.find('.size');
                    $size.val(aggregation.size);

                    if (!aggregation.excluded) {
                        aggregation.excluded = "";
                    }

                    var $excluded = section.find('.excluded');
                    $excluded.val(aggregation.excluded);

                    break;

                case 'sum':
                case 'avg':
                case 'min':
                case 'max':
                    if (aggregation.orderBy) {
                        var $orderBy = section.find('.orderBy');
                        $orderBy.val(aggregation.orderBy);
                    }
                    break;

                default:
                    console.warn('No aggregation of type', aggregation);
            }

            this.select('aggregationSelector').val(type);
            this.attachPropertySelection(section.find('.property-select'), {
                selected: aggregation && aggregation.field,
                placeholder: placeholder || i18n('dashboard.savedsearches.aggregation.property.placeholder')
            });
        };

        this.onFilterProperties = function(event, data) {
            if ($(event.target).is('.property-select')) return;

            this.$node.find('.property-select').trigger(event.type, data)
        };

        this.attachPropertySelection = function(node, options) {
            var self = this;
            if (!options) {
                options = {};
            }
            return Promise.require('util/ontology/propertySelect').then(function(FieldSelection) {
                node.teardownComponent(FieldSelection);

                const onlyDataTypes = self.validDataTypes();
                FieldSelection.attachTo(node, {
                    selectedProperty: options.selected,
                    onlyDataTypes,
                    onlySortable: onlyDataTypes.includes('geoLocation') ? null : true,
                    placeholder: options.placeholder || '',
                    rollupCompound: false,
                    hideCompound: true
                });
            });
        };

        this.validDataTypes = function() {
            var aggregation = _.chain(_.union(AGGREGATIONS, SUB_AGGREGATIONS))
                .find(a => a.value === this.currentAggregation.type)
                .value();

            return aggregation.dataTypes;
        };

    }
});
