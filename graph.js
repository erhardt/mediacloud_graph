var GRAPH_WIDTH       = 570,
    GRAPH_HEIGHT      = 570,
    MAX_SIZE          = 20,
    MIN_SIZE          = 3,
    MAX_FONT_SIZE     = 36,
    MIN_FONT_SIZE     = 3,
    MAX_MIN_ZOOM_FONT_SIZE = 10,
    X_MARGIN          = 60,
    HIST_MARGIN       = 4,
    Y_MARGIN          = 60,
    DURATION          = 1500,
    LINK_DELAY_WITH_TRANS = 1300,
    LINK_DELAY_NO_TRANS = 50,
    LINK_DELAY        = LINK_DELAY_WITH_TRANS,
    LINK_DURATION     = 1000,
    TIMEOUT           = LINK_DELAY + LINK_DURATION + 750,
    LABEL_SIZE_CUTOFF = 4,
    ZOOM_SPEED        = 0.3,
    MAX_ZOOM          = 10,
    MIN_ZOOM          = 1,
    LABEL_OFFSET      = 0.3,
    PI_TIME           = 0,
    MAX_PI_TIME       = 100,
    DISABLE_TRANS     = false,
    is_playing        = false,
    player_timeouts   = [],
    last_value        = 0,
    radius            = d3.scale.linear().domain([0,1]).range([MIN_SIZE, MAX_SIZE]),
    fontSize          = d3.scale.linear().domain([MIN_SIZE,MAX_SIZE]).range([MIN_FONT_SIZE, MAX_FONT_SIZE]).clamp(true),
    minFontSize       = d3.scale.linear().domain([1,MAX_ZOOM]).range([MIN_FONT_SIZE, MAX_MIN_ZOOM_FONT_SIZE]).clamp(true),
    //siteCategory      = d3.scale.ordinal().domain(siteCategories).range(colorbrewer.Set3[11]);
    siteCategory      = d3.scale.category20(),
    zoom_level        = 1
    nodeFieldsToShow  = [
        { key: 'url', label: 'URL' },
        { key: 'code_media_type', label: 'Media Type'},
        { key: 'story_count', label: 'Story Count'}
    ],
    all_frames        = null,
    selected_node     = null;

PI_TIME = calculatePi();
if (PI_TIME >= MAX_PI_TIME) {
    LINK_DELAY = LINK_DELAY_NO_TRANS;
    DISABLE_TRANS = true;
}
var svg = setupGraph();
//setupLegend(siteCategories);

d3.json('test_frames.json', function(frames) {
    var slider = $('#date-slider').slider({
        min: 0,
        max: frames.length - 1,
        range: "min",
        change: function(event, ui) {
            if (ui.value != last_value) { 
                animate(frames[ui.value]);
                last_value = ui.value;
            }
        }
    });
    all_frames = frames;
    animate(frames[0]);
    histogram(frames);
    updateHistogram(0);
    d3.select('#play').on('click', function(d, i) { play_toggle(frames); });
    setupEventListeners();
    $('.ui-slider-handle').focus();
});

function animate(frame, i) {
    // Calculate the denormalized position so we can use it later
    frame.nodes = frame.nodes.map(function(n) { 
        n.normedPosition = normalizePosition(frame.boundaries, n.position);
        n.normedSize = normalizeSize(frame.size_range, n.size);
        n.denormPosition = denormalizePosition(n.normedPosition);
        return n;
    });

    // Grab the selectors now so we don't have to keep doing it
    var nodes = svg.selectAll("g.node")
        .data(frame.nodes, function(n) { return n.id; })
    var links = svg.selectAll("line.link")
        .data(frame.links, function(l) { return l.source + '-' + l.target; })

    // Enter
    var group = addGroup(nodes.enter());
    addCircle(group);
    addText(group);
    addLink(frame, links.enter());

    // Event handlers
    nodes.on('click', highlightNode);

    // Update
    var updateTransition = updateGroup(nodes);
    updateCircle(updateTransition);
    updateText(updateTransition);
    updateLink(links, frame);

    // Exit
    var exit = nodes.exit().classed('removing', true),
        exitTrans = exit.transition();
    exitTrans.select('circle').attr('r', 0);
    exitTrans.select('text.label').style('font-size', '0px');
    exitTrans.remove();
    links.exit().remove();

    hideLinks(links);
    hideLabels(nodes);

    // Update the histogram and play button
    var frame_index = all_frames.indexOf(frame);
    updateHistogram(frame_index);
    if (all_frames.length - 1 == frame_index && is_playing) { 
        player_timeouts = [];
        is_playing = false;
        d3.select('#button-label').text('play');
        d3.select('#play button').html('&#9654;');
    }

    updateFrameNarrative(frame);

    // Keep node-info in sync with data in node
    userSelected = d3.select('g.node.selected:not(.removing)');
    if (!userSelected.empty()) {
        populateNodeInfo(userSelected.data()[0]);
    } else if (selected_node != null) {
        d3.select('#node-info').html('<em>Does not appear in current week</em>');
    }

    // Show links
    var selectedNode = d3.select('g.node.selected');
    if (!d3.select('#show-links:checked').empty()) {
        showLinks(links, LINK_DELAY);
    } else if (!selectedNode.empty()) {
        showLinks(getNodeLinks(selectedNode), LINK_DELAY);
    }

    // Show labels
    if (!d3.select('#show-labels:checked').empty()) {
        showLabels(nodes);
    } else if (!d3.select('g.node.selected').empty()) {
        showLabels(d3.select('g.node.selected'));
    }

    // If selected nodes are removed, make everything normal again
    if (!exit.filter('.selected').empty()) {
        //unhighlightNode();
    }
}

function setupGraph() {
    var svg = d3.select("#graph")
        .append("svg")
        .attr("width", GRAPH_WIDTH)
        .attr("height", GRAPH_HEIGHT)
        .attr("pointer-events", "all")
        .append('g')
        .attr('id', 'zoom-wrap')
        .call(d3.behavior.zoom().scaleExtent([1, MAX_ZOOM]).on("zoom", redraw))
        .append('g');

    svg.append('svg:rect')
        .attr('width', GRAPH_WIDTH)
        .attr('height', GRAPH_HEIGHT)
        .attr('fill', 'white'); 

    var defs = svg.append('svg:defs');
    defs
        .append('svg:marker')
        .attr('id', 'triangle')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 1)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z');

    var highlightGradient = defs
        .append('svg:radialGradient')
        .attr('id', 'highlight')
        .attr('r', '100%')

    highlightGradient
        .append('svg:stop')
        .attr('offset', '0%')
        .attr('stop-color', '#FFFF7D');

    highlightGradient
        .append('svg:stop')
        .attr('offset', '100%')
        .attr('stop-color', '#FFFF7D')
        .attr('stop-opacity', '0');

    d3.select('#date-slider').style('width', (GRAPH_WIDTH - 2 * X_MARGIN) + 'px');
    d3.select('#graph-wrapper').style('width', GRAPH_WIDTH + 'px');

    return svg;
}

function setupLegend(siteCategories) {
    siteCategories.forEach(function(category) { 
        var div = d3.select('#legend').append('div');
        div.append('div').classed('legend-swatch', true)
        .style('background-color', function() { return siteCategory(category); });
        div.append('span').text(category.replace(/ \([^\(\)]*\)$/g, ''));
    });
}

function setupEventListeners() {
    d3.select('#show-links').on('click', function() {
        if (!d3.select(this).filter(':checked').empty()) {
            showLinks(d3.selectAll('line.link'));
        } else {
            setLinkEndAttr(d3.selectAll('line.link').classed('hidden', true));
        }
    });
    d3.select('#show-labels').on('click', function() {
        d3.select(this).filter(':checked').empty() ?
            hideLabels(d3.selectAll('g.node:not(.selected)')) :
            showLabels(d3.selectAll('g.node'));
    });
    d3.select('#graph').on('click', unhighlightNode, true);
    d3.select('#disable-trans').on('click', function() { 
        if (d3.select(this).filter(':checked').empty()) {
            DISABLE_TRANS = false;
            LINK_DELAY = LINK_DELAY_WITH_TRANS;
        } else {
            DISABLE_TRANS = true;
            LINK_DELAY = LINK_DELAY_NO_TRANS;
        }
    });
    // I want the slider to always be in focus because I like to use the arrow keys
    d3.select('html').on('click', function() { $('.ui-slider-handle').focus(); });
}

function redraw() {
    zoom_level = d3.event.scale;
    svg.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    d3.selectAll('circle')
        .attr('r', function(n) { return radius(n.normedSize) / d3.event.scale; })
        .style('stroke-width', function(n) { return 2 / d3.event.scale; });
    d3.selectAll('line.link')
        .style('stroke-width', function() { return 1 / d3.event.scale; });
    //This is a big performance killer when zooming - fix it
        //.attr('dy', function() { return LABEL_OFFSET + 'em'; });
        correctFontSizes();
}

function correctFontSizes() {
    d3.selectAll('g.node:not(.selected) text.label')
        .style('font-size', function(n) {             
            var zoomedFontSize = fontSize.range([minFontSize(zoom_level), MAX_FONT_SIZE]);
            d3.select(this).classed('hidden', function(n) {
                return (d3.select('#show-labels:checked').empty() || zoomedFontSize(radius(n.normedSize)) < LABEL_SIZE_CUTOFF);
            });
            return zoomedFontSize(radius(n.normedSize)) / zoom_level;
        })
    d3.selectAll('g.node.selected text.label')
        .style('font-size', function() {
            return MAX_FONT_SIZE / zoom_level + 'px';
        });
}

function addGroup(nodes) { 
    var group = nodes
        .append("g")
        .attr("class", "node")
        .attr('id', function(n) { return 'node-' + n.id; })
        .attr("transform", function(n) { return "translate("
            + n.denormPosition.x + "," + n.denormPosition.y + ")"; })
        .classed('not-selected', function(n) { return !d3.select('.not-selected').empty() && n.id != selected_node; });
    return group;
}

function addLink(frame, links) {
    var newLinks = links 
        .insert("line", 'g.node')
        //.style('marker-end', 'url(#triangle)')
        .classed('link', true)
        .classed('hidden', true)
        .attr('id', function(l) { return 'link-' + l.source + '-' + l.target; })
        .datum(function(l) { return updateInteralLinkPosition(l, frame); });

    minimizeLinks(newLinks);
}

function addCircle(group) {
    group
        .append('circle')
        .attr('r', 0)
        //.style("fill", function(n) { return d3.rgb(n.color.r, n.color.g, n.color.b); });
        .style("fill", function(n) { return siteCategory(n.code_media_type); })
}

function addText(group) {
    group
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', LABEL_OFFSET + 'em')
        .attr('class', 'label')
        .text(function(n) { return n.label; })
        .classed('hidden', function(n) { return d3.select('#show-labels:checked').empty() || fontSize(radius(n.normedSize)) < LABEL_SIZE_CUTOFF; })
        .style('font-size', function(n) {
            return fontSize(radius(n.normedSize));
        });
}

function updateGroup(nodes) {
    nodes.classed('narrated', function(n) { return n.narrative; })
        .classed('selected', function(n) { return selected_node == n.id; })
    if (DISABLE_TRANS) { 
        var trans = nodes;
    } else {
        var trans = nodes
            .transition()
            .duration(DURATION);
    }
    trans.attr("transform", function(n) { return "translate("
            + n.denormPosition.x + "," + n.denormPosition.y + ")";
        });
    return trans;
}

function updateCircle(trans) {
    // Circle update
    trans
        .select('circle')
        .attr("r", function(n) { return radius(n.normedSize); })
        //.style("fill", function(n) { return d3.rgb(n.color.r, n.color.g, n.color.b); })
        .style("fill", function(n) { return siteCategory(n.code_media_type); })
}

function updateText(trans) {
    trans
        .select('text.label')
        .style('font-size', function(n) {
            return fontSize(radius(n.normedSize));
        })
    //.each('end', function() { d3.select(this).attr('dy', '0.3em'); })
}

function updateLink(links, frame) {
    links.datum(function(l) { return updateInteralLinkPosition(l, frame); });
    //minimizeLinks(links);
}

function updateFrameNarrative(frame) {
    var month_names = new Array ( );
    month_names[month_names.length] = "January";
    month_names[month_names.length] = "February";
    month_names[month_names.length] = "March";
    month_names[month_names.length] = "April";
    month_names[month_names.length] = "May";
    month_names[month_names.length] = "June";
    month_names[month_names.length] = "July";
    month_names[month_names.length] = "August";
    month_names[month_names.length] = "September";
    month_names[month_names.length] = "October";
    month_names[month_names.length] = "November";
    month_names[month_names.length] = "December";

    var day_names = new Array ( );
    day_names[day_names.length] = "Sunday";
    day_names[day_names.length] = "Monday";
    day_names[day_names.length] = "Tuesday";
    day_names[day_names.length] = "Wednesday";
    day_names[day_names.length] = "Thursday";
    day_names[day_names.length] = "Friday";
    day_names[day_names.length] = "Saturday";

    if (frame.narrative) {
        d3.select('#frame-info p').text(frame.narrative);
    } else {
        d3.select('#frame-info p').text('');
    }

    if (frame.start_date && frame.end_date) {
        var start_date = new Date(frame.start_date),
            end_date   = new Date(frame.end_date);
        d3.select('#start-date').text(function() { 
            if (start_date.getMonth() == end_date.getMonth()) {
                return month_names[start_date.getMonth()].substr(0, 3)
                + ' ' + start_date.getDate()
                + ' - ' + end_date.getDate()
                + ', ' + end_date.getFullYear();
            } else if (start_date.getFullYear() == end_date.getFullYear()) {
                return month_names[start_date.getMonth()].substr(0, 3)
                + ' ' + start_date.getDate()
                + ' - ' + month_names[end_date.getMonth()].substr(0, 3)
                + ' ' + end_date.getDate()
                + ', ' + end_date.getFullYear();
            } else {
                return month_names[start_date.getMonth()].substr(0, 3)
                + ' ' + start_date.getDate()
                + ', ' + start_date.getFullYear();
                + ' - ' + month_names[end_date.getMonth()].substr(0, 3)
                + ' ' + end_date.getDate()
                + ', ' + end_date.getFullYear();
            }
        });
    } else {
        d3.select('#start-date').text('');
    }
}

function showLabels(nodes) {
    nodes.selectAll('text.label')
        .classed('hidden', function(n) { return fontSize(radius(n.normedSize)) < LABEL_SIZE_CUTOFF; })
}

function hideLabels(nodes) {
    nodes.selectAll('text.label')
        .classed('hidden', true);
}

function showLinks(links, delay) {

    /*
    links.each(function(link) {
        d3.selectAll('g.node').filter(function(node) {
            return link.source == node.index;
        }).select('circle').transition().style('fill', '#ee2222').style('fill-opacity', 1);
        d3.selectAll('g.node').filter(function(node) {
            return link.target == node.index;
        }).select('circle').transition().style('fill', '#2222ee').style('fill-opacity', 1);
    })
    */

    if (delay) {
        maximizeLinks(links.classed('hidden', false).transition().delay(delay).duration(LINK_DURATION));
    } else {
        maximizeLinks(links.classed('hidden', false).transition().duration(LINK_DURATION));
    }
}

function hideLinks(links) {
    if (DISABLE_TRANS) {
        minimizeLinks(links.classed('hidden', true));
    } else {
        minimizeLinks(links.classed('hidden', true).transition());
    }
}

function histogram(frames) {
    var data = frames.map(function(f) { return f.nodes.length; }),
        histScale = d3.scale.linear().domain([0, Math.max.apply(null, data)]).range([3, d3.select('#histogram').node().clientHeight]),
        barWidth = (d3.select('#histogram').node().clientWidth - (data.length - 1) * HIST_MARGIN) / data.length;

    d3.select('#histogram').selectAll('.bar').data(data)
        .enter()
        .append('div')
        .attr('class', 'bar')
        .attr('title', function(d) { return d + ' sites'; })
        .style('width', function() { return barWidth + 'px'; })
        .style('height', function(d) { return histScale(d) + 'px'; })
        .style('margin-left', function(d, i) { return i == 0 ? 0 : HIST_MARGIN + 'px'; });
}

function updateHistogram(i) {
    d3.selectAll('#histogram .bar').classed('highlight', function(d, j) { return j == i; });
}

function getNodeLinks(node, type) { 
    if (typeof node.datum == 'function') {
        var node = node.datum();
    }
    var links = d3.selectAll('line.link').filter(function(link) {
        switch (type) {
            case 'inbound':
                return link.target == node.id;
            case 'outbound':
                return link.source == node.id;
            default:
                return link.target == node.id || link.source == node.id;
        }
    });
    return links;
}

function highlightNode(node) {
    d3.select(this).classed('selected', true);
    selected_node = this.id.slice(5);

    if (d3.select('#show-labels:checked').empty()) { 
        d3.selectAll('text.label').classed('hidden', true);
    }
    d3.select(this).select('text.label')
        .classed('hidden', false)
        .style('font-size', function(n) {
            return MAX_FONT_SIZE / zoom_level + 'px';
        });
    d3.selectAll('g.node').classed('not-selected', function(n) { return n != node; });
    populateNodeInfo(node);
    hideLinks(d3.selectAll('line.link'));
    showLinks(getNodeLinks(node));
}

function unhighlightNode() {
    selected_node = null;
    d3.selectAll('g.node').classed('not-selected', false).classed('selected', false);
    hideLinks(d3.selectAll('line.link'));
    if (d3.select('#show-labels:checked').empty()) {
        hideLabels(d3.selectAll('g.node'));
    }
    d3.selectAll('#node-info, #site-image, #node-narrative p').html('');
    d3.select('#node-name').text('');
    correctFontSizes();
}

function updateInteralLinkPosition(link, frame) {
    // Gephi is giving us links that shouldn't exist - I think
    var sourceNode = d3.select('#node-' + link.source);
    var targetNode = d3.select('#node-' + link.target);

    if (!sourceNode.empty() && !targetNode.empty()) {
        link.position = {
            x1: sourceNode.datum().denormPosition.x,
            y1: sourceNode.datum().denormPosition.y,
            x2: targetNode.datum().denormPosition.x,
            y2: targetNode.datum().denormPosition.y
        };
    } else {
        link.position = { x1: 0, y1: 0, x2: 0, y2: 0 };
    }
    return link;
}

function minimizeLinks(links) { 
    setLinkEndAttr(links);
}

function maximizeLinks(links) {
    setLinkEndAttr(links, true);
}

function setLinkEndAttr(links, maximized) {
    links
        .attr('x1', function(l) { return l.position.x1; })
        .attr('y1', function(l) { return l.position.y1; });
    if (maximized) {
        links
            .attr('x2', function(l) { return l.position.x2; })
            .attr('y2', function(l) { return l.position.y2; })
    } else {
        links
            .attr('x2', function(l) { return l.position.x1; })
            .attr('y2', function(l) { return l.position.y1; })
    }
}

function normalizePosition(boundaries, position) {
    var xScale = d3.scale.linear().domain([boundaries[0], boundaries[2]]).range([0,1]);
    var yScale = d3.scale.linear().domain([boundaries[1], boundaries[3]]).range([0,1]);
    return {
        x: xScale(position.x),
        y: yScale(position.y)
    };
}
function denormalizePosition(position) {
    return {
        x: position.x * (GRAPH_WIDTH - X_MARGIN * 2) + X_MARGIN,
        y: GRAPH_HEIGHT - position.y * (GRAPH_HEIGHT - Y_MARGIN * 2) - Y_MARGIN
    };
}
function normalizeSize(size_range, size) {
    var sizeScale = d3.scale.linear().domain([5, 50]).range([0,1]);
    return sizeScale(size);
}
function populateNodeInfo(node) {
    d3.select('#node-info').html(
        nodeFieldsToShow.map(function(field) {
            return '<dt>' + field.label + '</dt><dd>' + node[field.key] + '</dd>';
        }).reduce(function(prev, curr) { return prev + curr; })
        + '<dt>Inbound Links</dt><dd>' + getNodeLinks(node, 'inbound')[0].length + '</dd>'
        + '<dt>Outbound Links</dt><dd>' + getNodeLinks(node, 'outbound')[0].length + '</dd>'
    );
    if (node.screenshot) {
        d3.select('#site-image').html('<dt>Screenshot</dt><img src="' + node.screenshot + '" />');
    } else {
        d3.select('#site-image').html('');
    }

    d3.select('#node-name').text(node.label);

    if (node.narrative) {
        d3.select('#node-narrative p').text(node.narrative);
    } else {
        d3.select('#node-narrative p').text('');
    }
}

function play_toggle(frames) {
    if (is_playing) {
        player_timeouts.forEach(function(timeoutId) {
            clearTimeout(timeoutId);
        });
        player_timeouts = [];
        is_playing = false;
        d3.select('#button-label').text('play');
        d3.select('#play button').html('&#9654;');
    } else {
        frames.forEach(function(frame, i) {
            if (last_value == frames.length - 1) { last_value = 0; }
            if (i >= last_value) {
                player_timeouts.push(setTimeout(changeToFrame, (i - last_value) * TIMEOUT, i));
            }
        })
        is_playing = true;
        d3.select('#button-label').text('pause');
        d3.select('#play button').html('||');
    }
}

function changeToFrame(i) { $('#date-slider').slider('value', i); }
    

// This stuff is here to test benchmark, but it's not good right now.
function testRendering() {
    var startTest = top.startTest || function(){};
    var test = top.test || function(name, fn){ fn(); };
    var endTest = top.endTest || function(){};
    var prep = top.prep || function(fn){ fn(); };

    var ret, tmp;

    var elem = document.getElementById("test");
    var a = document.getElementsByTagName("a")[0];
    var num = 10240;

    var cur_time = Date.now();
    //test( "getAttribute", function(){
        for ( var i = 0; i < num; i++ )
        ret = elem.getAttribute("id");
    //});

    //test( "element.property", function(){
        for ( var i = 0; i < num * 2; i++ )
        ret = elem.id;
    //});

    //test( "setAttribute", function(){
        for ( var i = 0; i < num; i++ )
        a.setAttribute("id", "foo");
    //});

    //test( "element.property = value", function(){
        for ( var i = 0; i < num; i++ )
        a.id = "foo";
    //});

    //test( "element.expando = value", function(){
        for ( var i = 0; i < num; i++ )
        a["test" + num] = function(){};
    //});

    //test( "element.expando", function(){
        for ( var i = 0; i < num; i++ )
        ret = a["test" + num];
    //});

    var end_time = Date.now();
    var total_time = end_time - cur_time;
    return total_time;
}
function calculatePi(){
    var num = 1000000;
    var pi=4,top=4,bot=3,minus = true;
    var time = next(pi,top,bot,minus,num);
    return time;
}
function next(pi,top,bot,minus,num){
    var cur_time = Date.now();
    for(var i=0;i<num;i++){
        pi += (minus == true)?-(top/bot):(top/bot);
        minus = !minus;
        bot+=2;
    }
    var end_time = Date.now();
    var total_time = end_time - cur_time;
    return total_time;
}
