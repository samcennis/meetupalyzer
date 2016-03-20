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
    for (var i=0; i < groupsJSON.length; i++){
        data.push( {"name": groupsJSON[i].name, "x": groupsJSON[i].created, "y": groupsJSON[i].members } );
        console.log(data);   
    }
    
    $('#graphDiv').highcharts({
            chart: {
                type: 'scatter',
                zoomType: 'xy'
            },
            title: {
                text: 'Meetup Group Creation Date vs. Number of Members'
            },
            xAxis: {
                text: 'Creation Date',
                type: 'datetime',
            },
            yAxis: {
                title: {
                    text: 'Member Count'
                }
            },
            tooltip: {
                formatter: function() {
                    return  '<b>' + this.point.name +'</b><br/> Created ' +
                        Highcharts.dateFormat('%b %e, %Y',
                                              new Date(this.x))
                    + ' - ' + this.y + ' members.';
                }
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
                name: "Groups",
                data: data
            }],
            credits: false
        });
});
 
}

$(document).ready(ready);