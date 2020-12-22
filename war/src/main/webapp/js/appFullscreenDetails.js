
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
    'flight/lib/registry',
    './appFullscreenDetails.hbs',
    'tpl!./appFullscreenDetailsError',
    'detail/item/item',
    'util/vertex/formatters',
    'util/withDataRequest',
    'util/jquery.removePrefixedClasses'
], function(defineComponent, registry, template, errorTemplate, Detail, F, withDataRequest) {
    'use strict';

    return defineComponent(FullscreenDetails, withDataRequest);

    function filterEntity(v) {
        return !filterArtifacts(v);
    }

    function filterArtifacts(v) {
        return F.vertex.isArtifact(v);
    }

    function FullscreenDetails() {

        this.defaultAttrs({
            detailSelector: '.detail-pane .content',
            noResultsSelector: '.no-results',
            changeWorkspaceSelector: '.no-workspace-access li a'
        });

        this.after('initialize', function() {
            var self = this;

            this.$node.html(template({}));
            this.updateTitle();

            bcData.storePromise.then(store => store.observe(state => state.selection,
                (newSelection, oldSelection) => {
                    const elements = newSelection.idsByType;
                    const { vertices: vertexIds, edges: edgeIds } = elements;
                    this.updateItems({
                        add: { vertexIds, edgeIds }
                    });
                }
            ));
            this._windowIsHidden = false;
            this.on(document, 'openFullscreen', this.onOpenFullscreen);
            this.on(document, 'window-visibility-change', this.onVisibilityChange);
            this.on(document, 'vertexUrlChanged', this.onVertexUrlChange);
            this.on('click', {
                changeWorkspaceSelector: this.onChangeWorkspace
            });
            this.on('click', this.clearFlashing.bind(this));
            $(window).focus(this.clearFlashing.bind(this));

            this.on(document, 'verticesDeleted', this.onVerticesDeleted);
            this.on(document, 'edgesDeleted', this.onEdgesDeleted);
            this.on(document, 'logout', this.onLogout);

            this.objects = [];
            this.fullscreenIdentifier = Math.floor((1 + Math.random()) * 0xFFFFFF).toString(16).substring(1);
            this.$node.addClass('fullscreen-details');

            this.switchWorkspace(this.attr.workspaceId);
        });

        this.onOpenFullscreen = function(event, data) {
            if (!data) return;

            let F;
            Promise.require('util/vertex/formatters')
                .then(function(_F) {
                    F = _F;
                    return F.vertex.getVertexAndEdgeIdsFromDataEventOrCurrentSelection(data, { async: true });
                })
                .then(function({ vertexIds, edgeIds }) {
                    var url = F.vertexUrl.url(
                        [
                            ...vertexIds.map(v => `v${v}`),
                            ...edgeIds.map(e => `e${e}`)
                        ],
                        bcData.currentWorkspaceId
                    );
                    window.open(url);
                })
        };

        this.clearFlashing = function() {
            clearTimeout(this.timer);
            this._windowIsHidden = false;
        };

        this.onVerticesDeleted = function(event, data) {
            var self = this;

            if (this.attr.edgeIds.length) {
                removeRelatedEdges(data.vertexIds);
            }

            this.attr.vertexIds = _.difference(this.attr.vertexIds, data.vertexIds);
            if (this.attr.previousVertexIds && !_.difference(this.attr.previousVertexIds, this.attr.vertexIds).length) return;
            this.attr.previousVertexIds = this.attr.vertexIds;

            this.onItemsDeleted();

            function removeRelatedEdges(vertexIds) {
                var edgesToRemove = _.filter(self.objects, function(object) {
                    if (object.type !== 'edge') return false;

                    var hasDeletedVertex = _.some(vertexIds, function(vId) {
                        return vId === object.inVertexId || vId === object.outVertexId;
                    })

                    return hasDeletedVertex;
                });

                self.attr.edgeIds = _.difference(self.attr.edgeIds, _.pluck(edgesToRemove, 'id'));
            }
        };

        this.onLogout = function(event, data) {
            const errorMessage = data && data.message;
            this.trigger('willLogout');
            this.dataRequest('user', 'logout')
                .then(() => {
                    require(['login'], Login => {
                        Login.setErrorMessage(errorMessage);
                        window.location.reload();
                    })
                })
        };

        this.onEdgesDeleted = function(event, data) {
            this.attr.edgeIds = _.without(this.attr.edgeIds, data.edgeId);
            if (this.attr.previousEdgeIds && !_.difference(this.attr.previousEdgeIds, this.attr.edgeIds).length) return;
            this.attr.previousEdgeIds = this.attr.edgeIds;

            this.onItemsDeleted();
        };

        this.onItemsDeleted = function() {
            var self = this;

            Promise.all([
                self.attr.vertexIds.length ?
                    self.dataRequest('vertex', 'multiple', {
                        vertexIds: self.attr.vertexIds
                    }) : Promise.resolve([]),
                self.attr.edgeIds.length ?
                    self.dataRequest('edge', 'multiple', {
                        edgeIds: self.attr.edgeIds
                    }) : Promise.resolve([])
            ])
                .then(function(results) {
                    var vertices = results.shift().vertices || [],
                        edges = results.shift().edges || [];

                    self.objects = vertices.concat(edges);

                    self.updateLocationHash();
                    self.handleObjectsLoaded(self.objects);
                })
                .catch(self.handleVerticesFailed.bind(self));
        };

        this.updateLocationHash = function() {
            location.hash = F.vertexUrl.fragmentUrl(this.objects, this.attr.workspaceId);
        };

        this.updateLayout = function() {
            var entities = _.filter(this.objects, filterEntity).length,
                artifacts = _.filter(this.objects, filterArtifacts).length,
                verts = entities + artifacts;

            this.$node
                .removePrefixedClasses('vertices- artifacts- entities- has- entity-cols- onlyone')
                .toggleClass('onlyone', verts === 1)
                .addClass([
                    verts <= 4 ? 'vertices-' + verts : 'vertices-many',
                    'entities-' + entities,
                    'entity-cols-' + _.find([4, 3, 2, 1], function(i) {
                        return entities % i === 0;
                    }),
                    entities ? 'has-entities' : '',
                    'artifacts-' + artifacts,
                    artifacts ? 'has-artifacts' : ''
                ].join(' '));
        };

        this.updateTitle = function() {
            document.title = this.titleForVertices();
        };

        this.handleNoObjects = function() {
            var requiredFallback = this.attr.workspaceId !== bcData.currentWorkspaceId;

            document.title = requiredFallback ?
                i18n('fullscreen.unauthorized') :
                i18n('fullscreen.no_vertices');

            this.select('noResultsSelector')
                .html(errorTemplate({
                    objects: this.attr.vertexIds.concat(this.attr.edgeIds),
                    somePublished: false,
                    requiredFallback: requiredFallback,
                    noWorkspaceGiven: !this.attr.workspaceId
                }))
                .addClass('visible');
        };

        this.handleVerticesFailed = function() {
            this.handleNoObjects();
        };

        this.handleObjectsLoaded = function(objects, data) {
            var self = this,
                fallbackToPublic = this.attr.workspaceId !== bcData.currentWorkspaceId;

            Detail.teardownAll();
            this.$node.find('.detail-pane').remove();

            if (objects.length === 0) {
                return this.handleNoObjects();
            }

            this.objects = _.chain(objects)
                .sortBy(function(v) {
                    var descriptors = [];
                    // Image/Video/Audio before documents
                    if (v.type === 'vertex') {
                        descriptors.push(
                            F.vertex.displayType(v) === 'document' ? '1' : '0'
                        );
                    }
                    // Sort by title
                    descriptors.push(F.vertex.title(v).toLowerCase());

                    return descriptors.join('');
                })
                .sortBy(function(v) {
                    return v.type === 'vertex' ? 0 : 1;
                })
                .value();

            // Find vertices not found and insert at beginning
            var objectIds = this.attr.vertexIds.concat(this.attr.edgeIds),
                notFoundIds = _.difference(objectIds, _.pluck(this.objects, 'id')),
                notFound = _.map(notFoundIds, function(nId) {
                    return {
                        id: nId,
                        notFound: true,
                        properties: {
                            title: '?'
                        }
                    };
                });

            this.objects.splice.apply(this.objects, [0, 0].concat(notFound));
            if (notFound.length || fallbackToPublic) {
                this.select('noResultsSelector')
                    .html(errorTemplate({
                        objects: notFoundIds,
                        requiredFallback: fallbackToPublic,
                        somePublished: true,
                        workspaceTitle: this.workspaceTitle,
                        noWorkspaceGiven: !this.attr.workspaceId
                    }))
                    .addClass('visible someVerticesFound');
                this.loadWorkspaces();
            }

            this.objects.forEach(function(object) {
                if (object.notFound) return;

                var node = filterEntity(object) ?
                        this.$node.find('.entities-container') :
                        this.$node.find('.artifacts-container'),
                    type = filterArtifacts(object) ? 'artifact' : 'entity',
                    subType = F.vertex.displayType(object),
                    $newPane = $('<div class="detail-pane visible highlight-none">')
                        .addClass('type-' + type +
                            (subType ? (' subType-' + subType) : '') +
                            ' ' + F.className.to(object.id))
                        .append('<div class="content">')
                        .appendTo(node)
                        .find('.content')
                        .append('<div class="type-content">')
                        .find('.type-content');

                this.on('finishedLoadingTypeContent', function handler() {
                    this.off('finishedLoadingTypeContent', handler);
                    this.$node.find('.org-bigconnect-layout-body').css({ flex: 'none', overflow: 'visible' });
                    this.$node.find('.org-bigconnect-layout-root').css('overflow', 'visible');
                });

                var constraints = this.objects.length === 1 ? [] : ['width'];
                Detail.attachTo($newPane, { model: object, constraints: constraints });
            }.bind(this));

            if (data && data.preventRecursiveUrlChange !== true) {
                this.updateLocationHash();
            }
            this.updateLayout();
            this.updateTitle();
        };

        this.loadWorkspaces = function() {
            var self = this;

            this.dataRequest('workspace', 'all')
                .done(function(workspaces) {
                    if (workspaces.length > 1) {
                        var workspaceTpl = _.template(
                            '<li data-id="{workspaceId}" ' +
                            '<% if (disabled) { %>class="disabled"<% } %>>' +
                            '<a>{title}</a>' +
                            '</li>'
                        );
                        self.$node.find('.no-workspace-access')
                            .find('.caret').show()
                            .end()
                            .find('.dropdown-menu')
                            .html(_.chain(workspaces)
                                .sortBy(function(w) {
                                    return w.title.toLowerCase();
                                })
                                .map(function(workspace) {
                                    workspace.disabled = workspace.workspaceId === self.actualWorkspaceId;
                                    return workspaceTpl(workspace);
                                })
                                .value()
                                .join(''))
                            .prev('.dropdown-toggle').removeClass('disabled')
                    }
                });
        };

        this.onChangeWorkspace = function(event) {
            var workspaceId = $(event.target).closest('li').data('id').toString();
            this.switchWorkspace(workspaceId);
        };

        this.switchWorkspace = function(workspaceId) {
            var self = this;

            this.on(document, 'workspaceLoaded', function loaded(event, workspace) {
                self.workspaceTitle = workspace.title;
                self.actualWorkspaceId = workspace.workspaceId;
                self.off(document, 'workspaceLoaded', loaded);

                Promise.all([
                    self.attr.vertexIds.length ?
                        self.dataRequest('vertex', 'store', {
                            vertexIds: self.attr.vertexIds
                        }) : Promise.resolve([]),
                    self.attr.edgeIds.length ?
                        self.dataRequest('edge', 'store', {
                            edgeIds: self.attr.edgeIds
                        }) : Promise.resolve([])
                ])
                    .then(function(results) {
                        var vertices = results.shift(),
                            edges = results.shift();
                        self.handleObjectsLoaded(_.compact(vertices.concat(edges)));
                    })
                    .catch(self.handleVerticesFailed.bind(self))
            });
            if (workspaceId) {
                this.trigger(document, 'switchWorkspace', { workspaceId: workspaceId });
            } else {
                this.dataRequest('workspace', 'getOrCreate')
                    .done(function(workspace) {
                        self.attr.workspaceId = workspace.workspaceId;
                        self.trigger(document, 'switchWorkspace', { workspaceId: workspace.workspaceId });
                    })
            }
        };

        this.onVertexUrlChange = function(event, data) {
            var self = this,
                deferred = $.Deferred();

            if (data.workspaceId) {
                this.attr.workspaceId = data.workspaceId;
                if (bcData.currentWorkspaceId !== this.attr.workspaceId) {
                    this.on(document, 'workspaceLoaded', function loaded() {
                        self.off(document, 'workspaceLoaded', loaded);
                        deferred.resolve();
                    });
                    this.trigger(document, 'switchWorkspace', { workspaceId: this.attr.workspaceId });
                } else deferred.resolve();
            } else deferred.resolve();

            var vertexIds = _.difference(data.vertexIds, this.attr.vertexIds);
            var edgeIds = _.difference(data.edgeIds, this.attr.edgeIds);

            var toRemove = [];
            toRemove.concat(
                _.difference(this.attr.vertexIds, data.vertexIds),
                _.difference(this.attr.edgeIds, data.edgeIds)
            );

            deferred.done(function() {
                self.updateItems({
                    remove: toRemove,
                    add: {
                        vertexIds: vertexIds,
                        edgeIds: edgeIds
                    },
                    preventRecursiveUrlChange: true
                });
            })
        };

        this.onVisibilityChange = function(event, data) {
            this._windowIsHidden = data.hidden;
            if (data.visible) {
                clearTimeout(this.timer);
                this.updateTitle();
            }
        };

        this.updateItems = function(data) {
            var self = this,
                willRemove = !_.isEmpty(data.remove),
                willAdd = !_.isEmpty(data.add) && !!(data.add.vertexIds.length || data.add.edgeIds.length);

            if (!willRemove && !willAdd) {
                return;
            }

            if (willAdd) {
                var vertexIds = this.attr.vertexIds = _.uniq(data.add.vertexIds.concat(self.attr.vertexIds));
                var edgeIds = this.attr.edgeIds = _.uniq(data.add.edgeIds.concat(self.attr.edgeIds));
                Promise.all([
                    vertexIds.length ?
                        self.dataRequest('vertex', 'store', {
                            vertexIds: vertexIds
                        }) : Promise.resolve([]),
                    edgeIds.length ?
                        self.dataRequest('edge', 'store', {
                            edgeIds: edgeIds
                        }) : Promise.resolve([])
                ])
                    .then(function(results) {
                        self.handleObjectsLoaded(_.flatten(results), data);
                    })
            }

            if (willRemove) {
                data.remove.forEach(function(id) {
                    var $pane = self.$node.find('.detail-pane.' + F.className.to(id));
                    if ($pane.length) {
                        $pane
                            .find('.content').teardownAllComponents()
                            .end()
                            .remove();
                    }
                });

                this.objects = _.reject(this.objects, function(object) {
                    return _.contains(data.remove, object.id);
                });
            }

            if (data.preventRecursiveUrlChange !== true) {
                self.updateLocationHash();
            }
            self.updateLayout();
            self.updateTitle();
        };

        this.flashTitle = function(newVertexIds, newVertices) {
            var self = this,
                i = 0;

            clearTimeout(this.timer);

            if (!newVertices || newVertices.length === 0) return;

            var newVerticesById = _.indexBy(newVertices, 'id');

            if (this._windowIsHidden) {
                this.timer = setTimeout(function f() {
                    if (self._windowIsHidden && i++ % 2 === 0) {
                        if (newVertexIds.length === 1) {
                            document.title = i18n(
                                'fullscreen.title.added.one',
                                F.vertex.title(newVerticesById[newVertexIds[0]])
                            );
                        } else {
                            document.title = i18n('fullscreen.title.added.some', newVertexIds.length);
                        }
                    } else {
                        self.updateTitle();
                    }

                    if (self._windowIsHidden) {
                        self.timer = setTimeout(f, 500);
                    }
                }, 500);
            }
        };

        this.titleForVertices = function() {
            if (!this.objects || this.objects.length === 0) {
                return i18n('fullscreen.loading');
            }

            var sorted = _.sortBy(this.objects, function(v) {
                return v.notFound ? 1 : -1;
            });

            if (sorted.length === 1) {
                return F.vertex.title(sorted[0]);
            } else {
                var first = '"' + F.vertex.title(sorted[0]) + '"',
                    l = sorted.length - 1;

                if (l > 1) {
                    return i18n('fullscreen.title.some', first, l)
                }

                return i18n('fullscreen.title.one', first)
            }
        };
    }
});
