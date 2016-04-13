'use strict';

function ready() {


    var groupFilter = {};
    var eventFilter = {}; //???

    var creationDateFilter = []


    $('select').material_select();
    var $submitButton = $("#submitButton");

    function _error(error) {
        console.log("Error!");
    }

    function updateMeetupData(topic) {
        //getTopicId(topic);
        $.post('/api/update_meetup_data', function (result) {
            if (result.status == 200) {
                console.log("UPDATED SUCCESSFULLY!!")
            }
        }).fail(_error);
    }

    //Gets data from Meetup.com API, updates Mongo database, then updates JSON file for clients
    $submitButton.click(function () {
        updateMeetupData("Bluemix");
    });

    //Filter selection click handlers
    $("#membersByCreationDate").find(".topicFilterSelect select").change(function () {
        updateFilterScatterPlot("#membersByCreationDate", groupFilter);
    });

    $("#membersByCreationDate").find(".countryFilterSelect select").change(function () {
        updateFilterScatterPlot("#membersByCreationDate", groupFilter);
    });
    $("#eventsPerMonthParticipation").find(".topicFilterSelect select").change(function () {
        updateFilterScatterPlot("#eventsPerMonthParticipation", groupFilter);
    });

    $("#eventsPerMonthParticipation").find(".countryFilterSelect select").change(function () {
        updateFilterScatterPlot("#eventsPerMonthParticipation", groupFilter);
    });

    //div = container div of the chart to update
    //filter = what filter? (group, event)
    function updateFilterScatterPlot(div, filter) {

        //Get state of all filters for this chart
        var topicFilterId = $(div).find(".topicFilterSelect select").val(); //0 if display all topics, or else topic ID to filter by
        var countryFilterName = $(div).find(".countryFilterSelect select").val(); //0 if display all countries, or else country to filter by

        //Get "filter list" for each filter (true/false of if we should display each data point, or "all" if all should be displayed)
        var topicFilterList = (topicFilterId == 0) ? "all" : filter["topic"][topicFilterId];
        var countryFilterList = (countryFilterName == 0) ? "all" : filter["country"][countryFilterName];

        //Get the chart
        var chart = $(div).find(".chart").highcharts();

        //Go through each point and check if it should be displayed according to the filter lists
        for (var i = 0; i < chart.series[0].data.length; i++) {
            var shouldDisplay = ((topicFilterList == "all" || topicFilterList[i]) && (countryFilterList == "all" || countryFilterList[i]));
            var radius = shouldDisplay ? 5 : 0; //5 = visible, 0 = not visible

            chart.series[0].data[i].hideTooltip = !shouldDisplay;
            chart.series[0].data[i].update({
                marker: {
                    radius: radius
                    , states: {
                        hover: {
                            enabled: shouldDisplay
                        }
                    }
                }
            }, false); //Redraw false        
        }

        chart.redraw(); //only redraw at the end
    }


    //load in meetup data from local JSON data files
    $.getJSON("/meetup_data/groups.json", function (groupsJSON) {

        $.getJSON("/meetup_data/events.json", function (eventsJSON) {

            $.getJSON("/meetup_data/topics.json", function (topicsJSON) {

                //console.log("Groups: " + groupsJSON); // this will show the info it in firebug console
                //console.log("Events: " + eventsJSON);
                //console.log("Topics: " + topicsJSON);

                $("#summary").append("<h3><b>" + groupsJSON.length + "</b> groups and <b>" + eventsJSON.length + "</b> events related to these topics analyzed.</h3>");
                $("#summary").show();

                var creationDateData = [];
                var eventsPerMonthData = [];
                var mostCommonDayData = [{
                    name: "Sunday"
                    , y: 0
                }, {
                    name: "Monday"
                    , y: 0
                }, {
                    name: "Tuesday"
                    , y: 0
                }, {
                    name: "Wednesday"
                    , y: 0
                }, {
                    name: "Thursday"
                    , y: 0
                }, {
                    name: "Friday"
                    , y: 0
                }, {
                    name: "Saturday"
                    , y: 0
                }];
                var mapData = [];
                var yesRSVPsArray = [];

                //Set up data arrays for topic filters
                var topicIds = topicIdsFromJSON(topicsJSON);
                var countries = countriesFromJSON(groupsJSON);

                //Populate filter selection elements
                populateFilterSelectionElements(topicsJSON, countries);

                //Intialize groups filters
                groupFilter = initializeGroupFilter(topicIds, countries);

                //console.log(groupFilter);

                for (var i = 0; i < groupsJSON.length; i++) {

                    //Add this group's data to the filters
                    addToGroupFilter(groupFilter, topicIds, countries, groupsJSON[i])
                        //console.log(groupFilter);

                    yesRSVPsArray.push(groupsJSON[i].avg_yes_rsvps_per_event_last_6_months);

                    //Only add data if we found data on events in the last 6 months
                    //TODO: Make this if statement compatible with filter (keep track of index?)
                    //if (groupsJSON[i].avg_events_per_month_last_6_months != 0 && groupsJSON[i].avg_participation_rate != 0) {

                    eventsPerMonthData.push({
                        "name": groupsJSON[i].name
                        , "x": groupsJSON[i].avg_events_per_month_last_6_months
                        , "y": groupsJSON[i].avg_participation_rate
                        , "members": groupsJSON[i].members
                        , "avg_yes_rsvps": groupsJSON[i].avg_yes_rsvps_per_event_last_6_months
                        , "link": "http://www.meetup.com/" + groupsJSON[i].urlname
                    });

                    //}

                    creationDateData.push({
                        "name": groupsJSON[i].name
                        , "x": groupsJSON[i].created
                        , "y": groupsJSON[i].members
                        , "link": "http://www.meetup.com/" + groupsJSON[i].urlname
                        , "hideTooltip": false
                    });


                    mapData.push({
                        "name": groupsJSON[i].name
                        , "lat": groupsJSON[i].lat
                        , "lon": groupsJSON[i].lon
                        , "members": groupsJSON[i].members
                        , "country": groupsJSON[i].localized_country_name
                        , "link": "http://www.meetup.com/" + groupsJSON[i].urlname
                    })

                    for (var j = 0; j < groupsJSON[i].num_events_each_day_of_week.length; j++) {
                        //Add the number of events this day of the week to the totals
                        mostCommonDayData[j].y += groupsJSON[i].num_events_each_day_of_week[j];
                    }

                }

                console.log(groupFilter);

                var top10_attended = top10(yesRSVPsArray);

                //Populate top attendance table
                for (var j = 0; j < top10_attended.length; j++) {
                    $('#topAverageAttendanceTable > tbody:last-child').append('<tr><td><a target="_blank" href="http://www.meetup.com/' + groupsJSON[top10_attended[j][0]].urlname + '">' + groupsJSON[top10_attended[j][0]].name + '</a></td><td>' + groupsJSON[top10_attended[j][0]].avg_yes_rsvps_per_event_last_6_months + '</td><td>' + groupsJSON[top10_attended[j][0]].members + '</td><td>' + (Math.round((groupsJSON[top10_attended[j][0]].avg_participation_rate * 100) * 100) / 100) + '%</td></tr>');

                }

                //Sort on second column and disable sorting on the first column
                $("#topAverageAttendanceTable").tablesorter({
                    sortList: [[1, 1]]
                    , headers: {
                        0: {
                            sorter: false
                        }
                    }
                });

                createScatterPlot('#eventsPerMonthParticipationGraph', 'Average Number of Events Per Month vs. Participation Rate', 'Averages calculated from events held in the past 6 months.', 'Average Events Hosted By Meetup.com Group Per Month (Last 6 Months)', 'linear', 'Avg. Participation Rate', 'linear', function (_this) {
                    return '<b>' + _this.point.name + '</b><br/>' + _this.point.x + ' event(s) per month<br/>Avg attendance: ' + _this.point.avg_yes_rsvps + ' people<br/>' + (Math.round((_this.point.y * 100) * 100) / 100) + '% participation (' + _this.point.members + ' total members)';
                }, "Groups", eventsPerMonthData);

                //Number of Members by Creation Date Graph
                createScatterPlot('#membersByCreationDateChart', 'Number of Members by Creation Date', '', 'Meetup.com Group Creation Date', 'datetime', 'Member Count', 'linear', function (_this) {
                    return '<b>' + _this.point.name + '</b><br/> Created ' + Highcharts.dateFormat('%b %e, %Y', new Date(_this.x)) + ' - ' + _this.y + ' members.'
                }, "Groups", creationDateData);

                //Most Common Day to Schedule Event
                createColumnChart('#mostCommonDayChart', 'Event Day Popularity', '', 'Number of Events', 'linear', '{point.y} events', 'Popularity', mostCommonDayData);


                //TODO: Make this a seperate function
                $('#groupLocationMap').highcharts('Map', {


                    title: {
                        text: 'Meetup.com Group Locations'
                    },

                    mapNavigation: {
                        enabled: true
                        , enableMouseWheelZoom: false
                    },

                    tooltip: {
                        headerFormat: ''
                        , pointFormat: '<b>{point.name}</b><br>{point.country}<br>{point.members} members'
                    },

                    series: [{
                        // Use the gb-all map with no data as a basemap
                        mapData: Highcharts.maps['custom/world']
                        , name: 'Basemap'
                        , borderColor: '#A0A0A0'
                        , nullColor: 'rgba(200, 200, 200, 0.3)'
                        , showInLegend: false
                }, {
                        name: 'Separators'
                        , type: 'mapline'
                        , data: Highcharts.geojson(Highcharts.maps['custom/world'], 'mapline')
                        , color: '#707070'
                        , showInLegend: false
                        , enableMouseTracking: false
                }, {
                        // Specify points using lat/lon
                        type: 'mappoint'
                        , name: 'Cities'
                        , color: Highcharts.getOptions().colors[1]
                        , data: mapData
                        , point: {
                            events: {
                                click: function () {
                                    var url = this.link;
                                    window.open(url, '_blank');
                                }
                            }
                        }
                        , dataLabels: {
                            enabled: false
                        }
                        , showInLegend: false

                }]
                    , credits: {
                        enabled: false
                    }
                });

            });

        });

    });

    function createScatterPlot(div, title, subtitle, xAxisText, xAxisType, yAxisText, yAxisType, tooltipFormatterFunction, seriesName, data) {

        var tooltipFunc = tooltipFormatterFunction;
        //var _this = this;

        $(div).highcharts({
            chart: {
                type: 'scatter'
                , zoomType: 'xy'
            }
            , title: {
                text: title
            }
            , subtitle: {
                text: subtitle
            }
            , xAxis: {
                title: {
                    text: xAxisText
                }
                , type: xAxisType
            }
            , yAxis: {
                title: {
                    text: yAxisText
                }
                , type: yAxisType
            }
            , tooltip: {
                formatter: function () {
                    if (!this.point.hideTooltip) return tooltipFunc(this);
                    else return false;
                }
            }
            , plotOptions: {
                scatter: {
                    marker: {
                        radius: 5
                        , states: {
                            hover: {
                                enabled: true
                                , lineColor: 'rgb(100,100,100)'
                            }
                        }
                    }
                    , states: {
                        hover: {
                            marker: {
                                enabled: false
                            }
                        }
                    }
                }
            }
            , series: [{
                name: seriesName
                , data: data
                , point: {
                    events: {
                        click: function () {
                            var url = this.link;
                            window.open(url, '_blank');
                        }
                    }
                }
                , showInLegend: false
            }]
            , credits: false
        });
    }

    function createColumnChart(div, title, subtitle, yAxisText, yAxisType, format, seriesName, data) {

        $(div).highcharts({
            chart: {
                type: "column"
            }
            , title: {
                text: title
            }
            , subtitle: {
                text: subtitle
            }
            , xAxis: {
                type: 'category'
            }
            , yAxis: {
                title: {
                    text: yAxisText
                    , type: yAxisType
                }
            }
            , legend: {
                enabled: false
            }
            , plotOptions: {
                series: {
                    borderWidth: 0
                    , dataLabels: {
                        enabled: true
                        , format: format
                    }
                }
            }
            , series: [{
                name: seriesName
                , colorByPoint: true
                , data: data
        }]
            , credits: false
        });



    }

    function topicIdsFromJSON(topicsJSON) {
        var topicIds = [];
        //topicNames.push("all");

        for (var i = 0; i < topicsJSON.length; i++) {
            topicIds.push(topicsJSON[i].id);
        }

        return topicIds;

    }

    function countriesFromJSON(groupsJSON) {
        //Add all uniqie countries from groupsJSON to a list
        var countries = [];

        for (var i = 0; i < groupsJSON.length; i++) {
            if (countries.indexOf(groupsJSON[i].localized_country_name) == -1) {
                countries.push(groupsJSON[i].localized_country_name);
            }
        }

        countries.sort();

        //Move USA to the front of the list if its there
        var USAIndex = countries.indexOf("USA");
        if (USAIndex != -1) {
            countries.splice(USAIndex, 1);
        }
        countries.unshift("USA");

        return countries;
    }

    function initializeGroupFilter(topicIds, countries) { //,countries, other filters, etc.
        var filterObj = new Object();

        //Initialize topic filter
        filterObj["topic"] = {};
        for (var i = 0; i < topicIds.length; i++) {
            filterObj["topic"][topicIds[i]] = [];
        }

        //Initialize country filter
        filterObj["country"] = {};
        for (var i = 0; i < countries.length; i++) {
            filterObj["country"][countries[i]] = [];
        }

        //Initialize state filter
        filterObj["state"] = {};

        //Initialize more filters...

        return filterObj;
    }

    function addToGroupFilter(filterObj, topicIds, countries, group) {
        var thisGroupTopicIds = _.pluck(group.topics, "id"); //compiles this group's topic ids into a list
        var thisGroupCountry = group.localized_country_name;

        //Add topic filter
        //Iterate through all topic ids searched for to check which ones this group falls under
        for (var i = 0; i < topicIds.length; i++) {
            var topicIdInt = parseInt(topicIds[i]);

            //If this group contains the topic id, then add true to this topic's boolean array 
            if (thisGroupTopicIds.indexOf(topicIdInt) != -1) {
                filterObj["topic"][topicIdInt].push(true);
            } else {
                filterObj["topic"][topicIdInt].push(false);
            }
        }

        //Add countries filter
        //Add true to this group's country, false to others
        Object.keys(filterObj["country"]).forEach(function (key, index) {
            if (key == thisGroupCountry) {
                filterObj["country"][key].push(true);
            } else {
                filterObj["country"][key].push(false);
            }
        });

    }

    function populateFilterSelectionElements(topicsJSON, countries) {
        //Add topic filters to all graphs
        $(".topicFilterSelect.dynamicPop select").each(function () {
            $(this).append($("<option />").val(0).text("All topics"));
            for (var i = 0; i < topicsJSON.length; i++) {
                var topic = topicsJSON[i];
                $(this).append($("<option />").val(topic.id).text(topic.name));
            }
            $(this).val(0); //set all as default
        });

        //Add country filters to all graphs
        $(".countryFilterSelect.dynamicPop select").each(function () {
            $(this).append($("<option />").val(0).text("All countries"));
            for (var i = 0; i < countries.length; i++) {
                var country = countries[i];
                $(this).append($("<option />").val(country).text(country));
            }
            $(this).val(0); //set all as default
        });

        $('select').material_select();
    }

    //Top 10 function from http://stackoverflow.com/a/483583
    function top10(arr) {
        var results = [[0, Number.MAX_VALUE], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];

        for (var i = 0; i < arr.length; i++) {
            // search from back to front
            for (var j = 9; j >= 0; j--) {
                if (arr[i] <= results[j][1]) {
                    if (j == 9)
                        break;
                    results.splice(j + 1, 0, [i, arr[i]]);
                    results.pop();
                    break;
                }
            }
        }
        return results.slice(1);
    }

}

$(document).ready(ready);