'use strict';

function ready() {
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
    
    
//load in meetup data from local JSON data files
$.getJSON("/meetup_data/groups.json", function(groupsJSON) {
    
    console.log(groupsJSON); // this will show the info it in firebug console
    var creationDateData = [];
    var eventsPerMonthData = [];
    var mapData = [];
    var yesRSVPsArray = [];
    for (var i=0; i < groupsJSON.length; i++){
        
        yesRSVPsArray.push(groupsJSON[i].avg_yes_rsvps_per_event_last_6_months);

        //Only add data if we found data on events in the last 6 months
        if ( groupsJSON[i].avg_events_per_month_last_6_months != 0 && groupsJSON[i].avg_participation_rate != 0 ){
            
            eventsPerMonthData.push( {"name": groupsJSON[i].name, "x": groupsJSON[i].avg_events_per_month_last_6_months, "y": groupsJSON[i].avg_participation_rate, "members": groupsJSON[i].members, "avg_yes_rsvps": groupsJSON[i].avg_yes_rsvps_per_event_last_6_months } );
            
            //console.log( {"name": groupsJSON[i].name, "x": groupsJSON[i].avg_events_per_month_last_6_months, "y": groupsJSON[i].avg_participation_rate, "members": groupsJSON[i].members }  );
        }
      
        creationDateData.push( {"name": groupsJSON[i].name, "x": groupsJSON[i].created, "y": groupsJSON[i].members } );
        
        mapData.push( {"name": groupsJSON[i].name, "lat": groupsJSON[i].lat, "lon": groupsJSON[i].lon, "members": groupsJSON[i].members, "country": groupsJSON[i].localized_country_name})

    }
    
    var top10_attended = top10(yesRSVPsArray);
    
    //Populate top attendance table
    for ( var j = 0; j < top10_attended.length; j++ ){
        
        
        $('#topAverageAttendanceTable > tbody:last-child').append('<tr><td>' + groupsJSON[top10_attended[j][0]].name + '</td><td>' + groupsJSON[top10_attended[j][0]].avg_yes_rsvps_per_event_last_6_months + '</td><td>' + groupsJSON[top10_attended[j][0]].members + '</td><td>' +  groupsJSON[top10_attended[j][0]].avg_participation_rate + '</td></tr>');
    
    }
    
    
    createScatterPlot('#eventsPerMonthParticipationGraph', 'Average Number of Events Per Month vs. Participation Rate', '', 'Average Events Hosted By Meetup.com Group Per Month', 'linear', 'Avg. Participation Rate', 'linear', function() { return '<b>' + this.point.name +'</b><br/>' + this.point.x + ' event(s) per month<br/>Avg attendance: ' + this.point.avg_yes_rsvps + ' people<br/>' + (Math.round((this.point.y * 100) * 100)/100) + '% participation (' + this.point.members + ' total members)'; }, "Groups", eventsPerMonthData);
    
    //Number of Members by Creation Date Graph
    createScatterPlot('#membersByCreationDateChart', 'Number of Members by Creation Date', '', 'Meetup.com Group Creation Date', 'datetime', 'Member Count', 'linear', function() { return '<b>' + this.point.name +'</b><br/> Created ' + Highcharts.dateFormat('%b %e, %Y', new Date(this.x)) + ' - ' + this.y + ' members.'; }, "Groups", creationDateData);


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
            dataLabels: {enabled: false},
            showInLegend: false
              
        }],
        credits: {enabled: false}
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
                showInLegend: false
            }],
            credits: false
        });
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