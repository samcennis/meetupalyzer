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
    var data = [];   
    var mapData = [];
    for (var i=0; i < groupsJSON.length; i++){
        data.push( {"name": groupsJSON[i].name, "x": groupsJSON[i].created, "y": groupsJSON[i].members } );
        
        mapData.push( {"name": groupsJSON[i].name, "lat": groupsJSON[i].lat, "lon": groupsJSON[i].lon, "members": groupsJSON[i].members, "country": groupsJSON[i].localized_country_name})
        
        /*[ {
                name: 'Lerwick',
                lat: 60.155,
                lon: -1.145,
                dataLabels: {
                    align: 'left',
                    x: 5,
                    verticalAlign: 'middle'
                }
            }]*/
        
        console.log(data);   
    }
    
    //Number of Members by Creation Date Graph
    createScatterPlot('#membersByCreationDateChart', 'Number of Members by Creation Date', '', 'Meetup.com Group Creation Date', 'datetime', 'Member Count', 'linear', function() { return '<b>' + this.point.name +'</b><br/> Created ' + Highcharts.dateFormat('%b %e, %Y', new Date(this.x)) + ' - ' + this.y + ' members.'; }, "Groups", data);

    

    $('#groupLocationMap').highcharts('Map', {

        title: {
            text: 'Meetup.com Group Locations'
        },

        mapNavigation: {
            enabled: true
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
    
}

$(document).ready(ready);