'use strict';

function ready() {
    
    
    var creationDateDataTopicFilter = {};
    
    
    $('select').material_select();
    var $submitButton = $("#submitButton");

function _error(error) {
    console.log("Error!");
}
    
function updateMeetupData(topic){
    //getTopicId(topic);
    $.post('/api/update_meetup_data', function(result){
        if (result.status == 200){
            console.log("UPDATED SUCCESSFULLY!!")
        }    
    }).fail(_error);
}
 
//Gets data from Meetup.com API, updates Mongo database, then updates JSON file for clients
$submitButton.click(function() {
    updateMeetupData("Bluemix");
}); 
  
//Filter on click handler
$("#creationDateTopicFilterSelect").change(function() {
    var creationDateTopicIdFilterVal = $(this).val();
    updateCreationDateTopicIdFilter(creationDateTopicIdFilterVal);
});
    
function updateCreationDateTopicIdFilter(val){
    
    var chart = $("#membersByCreationDateChart").highcharts();
    
    //If val = 0, display all and return
    if (val == 0){
        for (var i=0; i < chart.series[0].data.length; i++){
            chart.series[0].data[i].update({marker: { radius: 5 }}, false); //redraw false or else it will hang
        }
    }
    else{
        //filterList is a list of true/false for visibility of each data point
        var filterList = creationDateDataTopicFilter[val];
        for (var i=0; i < 20; i++){
            var newRadius = (filterList[i]) ? 5 : 0; //5 = visible, 0 = not visible
            chart.series[0].data[i].update({marker: { radius: newRadius }}, false); //redraw false    
        }
    }
    chart.redraw();
}
    
    
//load in meetup data from local JSON data files
$.getJSON("/meetup_data/groups.json", function(groupsJSON) {
    
    $.getJSON("/meetup_data/events.json", function(eventsJSON) {
        
        $.getJSON("/meetup_data/topics.json", function(topicsJSON) {

            console.log("Groups: " + groupsJSON); // this will show the info it in firebug console
            console.log("Events: " + eventsJSON);
            console.log("Topics: " + topicsJSON);

            $("#summary").append("<h3><b>" + groupsJSON.length + "</b> groups and <b>" + eventsJSON.length + "</b> events analyzed.</h3>");
            $("#summary").show();

            var creationDateData = [];
            var eventsPerMonthData = [];
            var mapData = [];
            var yesRSVPsArray = [];
            
            //Set up data arrays for topic filters
            var topicIds = topicIdsFromJSON(topicsJSON);
            //Create map of topicIds to boolean arrays
            creationDateDataTopicFilter = initializeTopicFilters(topicIds); 
            
            //console.log(creationDateDataTopicFilter);
            
            for (var i=0; i < groupsJSON.length; i++){

                yesRSVPsArray.push(groupsJSON[i].avg_yes_rsvps_per_event_last_6_months);

                //Only add data if we found data on events in the last 6 months
                if ( groupsJSON[i].avg_events_per_month_last_6_months != 0 && groupsJSON[i].avg_participation_rate != 0 ){

                    eventsPerMonthData.push( {"name": groupsJSON[i].name, "x": groupsJSON[i].avg_events_per_month_last_6_months, "y": groupsJSON[i].avg_participation_rate, "members": groupsJSON[i].members, "avg_yes_rsvps": groupsJSON[i].avg_yes_rsvps_per_event_last_6_months, "link": "http://www.meetup.com/" + groupsJSON[i].urlname } );
                    
                }

                creationDateData.push( {"name": groupsJSON[i].name, "x": groupsJSON[i].created, "y": groupsJSON[i].members, "link": "http://www.meetup.com/" + groupsJSON[i].urlname } );
                
                
                addToTopicFilter(creationDateDataTopicFilter, topicIds, groupsJSON[i]);
                console.log(creationDateDataTopicFilter);
                
                
                mapData.push( {"name": groupsJSON[i].name, "lat": groupsJSON[i].lat, "lon": groupsJSON[i].lon, "members": groupsJSON[i].members, "country": groupsJSON[i].localized_country_name, "link": "http://www.meetup.com/" + groupsJSON[i].urlname})

            }
            
           console.log(creationDateDataTopicFilter);

            var top10_attended = top10(yesRSVPsArray);

            //Populate top attendance table
            for ( var j = 0; j < top10_attended.length; j++ ){
                $('#topAverageAttendanceTable > tbody:last-child').append('<tr><td><a target="_blank" href="http://www.meetup.com/' + groupsJSON[top10_attended[j][0]].urlname + '">' + groupsJSON[top10_attended[j][0]].name + '</a></td><td>' + groupsJSON[top10_attended[j][0]].avg_yes_rsvps_per_event_last_6_months + '</td><td>' + groupsJSON[top10_attended[j][0]].members + '</td><td>' +  (Math.round((groupsJSON[top10_attended[j][0]].avg_participation_rate * 100) * 100)/100) + '%</td></tr>');

            }


            createScatterPlot('#eventsPerMonthParticipationGraph', 'Average Number of Events Per Month vs. Participation Rate', 'Averages calculated from events held in the past 6 months.', 'Average Events Hosted By Meetup.com Group Per Month (Last 6 Months)', 'linear', 'Avg. Participation Rate', 'linear', function() { return '<b>' + this.point.name +'</b><br/>' + this.point.x + ' event(s) per month<br/>Avg attendance: ' + this.point.avg_yes_rsvps + ' people<br/>' + (Math.round((this.point.y * 100) * 100)/100) + '% participation (' + this.point.members + ' total members)'; }, "Groups", eventsPerMonthData);

            //Number of Members by Creation Date Graph
            createScatterPlot('#membersByCreationDateChart', 'Number of Members by Creation Date', '', 'Meetup.com Group Creation Date', 'datetime', 'Member Count', 'linear', function() { return '<b>' + this.point.name + '</b><br/> Created ' + Highcharts.dateFormat('%b %e, %Y', new Date(this.x)) + ' - ' + this.y + ' members.'; }, "Groups", creationDateData);


            $('#groupLocationMap').highcharts('Map', {

                title: {
                    text: 'Meetup.com Group Locations'
                },

                mapNavigation: {
                    enabled: true,
                    enableMouseWheelZoom: false
                },

                tooltip: {
                    headerFormat: '',
                    pointFormat: '<b>{point.name}</b><br>{point.country}<br>{point.members} members'
                },

                series : [{
                    // Use the gb-all map with no data as a basemap
                    mapData: Highcharts.maps['custom/world'],
                    name: 'Basemap',
                    borderColor: '#A0A0A0',
                    nullColor: 'rgba(200, 200, 200, 0.3)',
                    showInLegend: false
                }, {
                    name: 'Separators',
                    type: 'mapline',
                    data: Highcharts.geojson(Highcharts.maps['custom/world'], 'mapline'),
                    color: '#707070',
                    showInLegend: false,
                    enableMouseTracking: false
                },{
                    // Specify points using lat/lon
                    type: 'mappoint',
                    name: 'Cities',
                    color: Highcharts.getOptions().colors[1],
                    data: mapData,
                    point: {
                        events: {
                            click: function(){
                                var url = this.link;
                                window.open(url,'_blank');
                            }
                        }
                    },
                    dataLabels: {enabled: false},
                    showInLegend: false

                }],
                credits: {enabled: false}
            });
        
        });
   
    });
    
});
    
function createScatterPlot(div, title, subtitle, xAxisText, xAxisType, yAxisText, yAxisType, tooltipFormatterFunction, seriesName, data){
    $(div).highcharts({
            chart: {
                type: 'scatter',
                zoomType: 'xy'
            },
            title: {
                text: title 
            },
            subtitle: {
                text: subtitle
            },
            xAxis: {
                title: {
                    text: xAxisText
                },
                type: xAxisType
            },
            yAxis: {
                title: {
                    text: yAxisText
                },
                type: yAxisType
            },
            tooltip: {
                formatter: tooltipFormatterFunction
            },
            plotOptions: {
                scatter: {
                    marker: {
                        radius: 5,
                        states: {
                            hover: {
                                enabled: true,
                                lineColor: 'rgb(100,100,100)'
                            }
                        }
                    },
                    states: {
                        hover: {
                            marker: {
                                enabled: false
                            }
                        }
                    }
                }
            },
            series: [{
                name: seriesName,
                data: data,
                point: {
                    events: {
                        click: function(){
                            var url = this.link;
                            window.open(url,'_blank');
                        }
                    }
                },
                showInLegend: false
            }],
            credits: false
        });
}
    
function topicIdsFromJSON(topicsJSON){
    var topicIds = [];
    //topicNames.push("all");
    
    for (var i=0; i < topicsJSON.length; i++){
        topicIds.push(topicsJSON[i].id);
    }
    
    return topicIds;
    
}
    
function initializeTopicFilters(topicIds){
    var dataList = new Object();
    
    //dataList["all"] = [];
    for (var i=0; i < topicIds.length; i++){
        dataList[topicIds[i]] = [];
    }
    
    return dataList;
}
    
function addToTopicFilter(creationDateDataTopicFilter, topicIds, group){
    var thisGroupsTopicIds = _.pluck(group.topics, "id"); //compiles this group's topic ids into a list        
    
    //Iterate through all topic ids searched for to check which ones this group falls under
    for (var i = 0; i < topicIds.length ; i++ ){
        var topicIdInt = parseInt(topicIds[i]);
        
        //If this group contains the topic id j, then add true to this topic's boolean array 
        if ( thisGroupsTopicIds.indexOf(topicIdInt) != -1 ){
            creationDateDataTopicFilter[topicIdInt].push(true);
        } else {
            creationDateDataTopicFilter[topicIdInt].push(false);
        }          
    }
}

//Top 10 function from http://stackoverflow.com/a/483583
function top10(arr) {
  var results = [[0,Number.MAX_VALUE],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]];

  for (var i=0; i<arr.length; i++) {
    // search from back to front
    for (var j=9; j>=0; j--) {
       if (arr[i] <= results[j][1]) {
         if (j==9)
           break;
         results.splice(j+1, 0, [i, arr[i]]);
         results.pop();
         break;
      }
    }
  }
  return results.slice(1);
}
    
}

$(document).ready(ready);