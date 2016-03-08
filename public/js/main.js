'use strict';

function ready() {
    $('select').material_select();
    
    var $topicSelect = $("#topicSelect");
    var $submitButton = $("#submitButton");

function _error(error) {
    console.log("Error!");
    /*var message = typeof error.responseJSON.error === 'string' ?
      error.responseJSON.error :
      'Error code ' + error.responseJSON.error.code + ': ' + error.responseJSON.error.message;
    console.log(message);*/
}

function getTopicId(topic) {
    $.post('/api/topic_id', {'topic': topic}, topicIdCallback)
     .fail(_error);
} 
    
function findGroupsByTopicId(topic_id) {
    $.post('/api/find/groups', {'topic_id': topic_id}, findGroupsByTopicIdCallback)
     .fail(_error);   
}
    
function findEventsByGroupIdList(group_id_list) {
    $.post('/api/find/events', {'group_id_list': group_id_list}, findEventsByGroupIdCallback)
     .fail(_error); 
}
  
    
function topicIdCallback(data){
    if (data.topic_id != -1){
        findGroupsByTopicId(data.topic_id);
    }
    else {
        console.log("Did not get a valid topic id.");
    }
}

function findGroupsByTopicIdCallback(data){
    //console.log("find callback!!");
    //All the groups are in the data!!!
    console.log(data);
    
    //Add all of these groups to the database
    $.post('/db/addGroupList', {'group_list' : data}).fail(_error); 
    
    var groupIdList = [];
    
    for (var i=0; i < data.length; i++){
        //For each group, add it to the database, gather data on all of the events associated with them
        //Add this group and its details to the database
        
        //Add this group id to a list for a request of events
        groupIdList.push(data[i].id);
        
        /*$("#resultsTable").append("<tr><td>" + data[i].name + "</td>"
                                 +"<td>" + data[i].country + "</td>"
                                 +"<td>" + data[i].state + "</td>"
                                 +"<td>" + data[i].members + "</td>"
                                 +"<td>" + ((data[i].next_event) ? data[i].next_event.yes_rsvp_count : "N/A") + "</td></tr>");*/
    }   
    
    findEventsByGroupIdList(groupIdList);
}
    
function findEventsByGroupIdCallback(data){
    console.log(data);
    
}
    
$submitButton.click(function() {
    /*var text = $("#textarea1").val();
    getTopicId(text);*/
    
    //getTopicId($topicSelect.val());
    
    //var text = $("#textarea1").val();
    //$.post('/api/addTodo', {'desc': text}, function(){console.log("post callback")});
    
    
    
    /*var text = $textArea.val();
    $submittedTxt.html(text);
    $submittedTxt.show();
    $output.hide();
    $loading.show();
    getToneAnalysis(text);*/
}); 
    
    
//Load in the graph
 $.post('/db/getGroupDataMemberMap', {}, function(data){
        
    console.log(data);

    // Set the dimensions of the canvas / graph
    var margin = {top: 30, right: 20, bottom: 30, left: 50},
        width = 1000 - margin.left - margin.right,
        height = 450 - margin.top - margin.bottom;

    // Parse the date / time
    //var parseDate = d3.time.format("%d-%b-%y").parse;

    // Set the ranges
    var x = d3.time.scale().range([0, width]);
    var y = d3.scale.linear().range([height, 0]);

    // Define the axes
    var xAxis = d3.svg.axis().scale(x)
        .orient("bottom").ticks(5);

    var yAxis = d3.svg.axis().scale(y)
        .orient("left").ticks(5);

    // Define the line
    var valueline = d3.svg.line()
        .x(function(d) { return x(d.created); })
        .y(function(d) { return y(d.members); });

    // Adds the svg canvas
    var svg = d3.select("#graphDiv")
        .append("svg")
            .attr("id", "memberDateGraph")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
        .append("g")
            .attr("transform", 
                  "translate(" + margin.left + "," + margin.top + ")");

    // Get the data
    data.forEach(function(d) {
        d.created = new Date(d.created);
        d.members = +d.members;
    });

    // Scale the range of the data
    x.domain(d3.extent(data, function(d) { return d.created; }));
    y.domain([0, d3.max(data, function(d) { return d.members; })]);

    // Add the valueline path.
    /*svg.append("path")
        .attr("class", "line")
        .attr("d", valueline(data));*/

    svg.selectAll("circle")
        .data(data)
        .enter()
        .append("circle")
        .attr("cx", function(d) {
            return x(d.created);
        })
        .attr("cy",  function(d) {
            return y(d.members);
        })
        .attr("r", 5);

    // Add the X Axis
    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);

    // Add the Y Axis
    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);

    // Add the X label
    svg.append("text")
    .attr("class", "x label")
    .attr("text-anchor", "end")
    .attr("x", width/2)
    .attr("y", height - 6)
    .text("Date of Meetup group creation");

    // Add the Y label
    svg.append("text")
    .attr("class", "y label")
    .attr("text-anchor", "end")
    .attr("y", 6)
    .attr("dy", ".75em")
    .attr("transform", "rotate(-90)")
    .text("Number of members");

}).fail(_error);
    
    
}

$(document).ready(ready);