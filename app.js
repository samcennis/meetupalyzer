'use strict';

var express = require('express')
    , app = express()
    , watson = require('watson-developer-cloud')
    , bodyParser = require('body-parser')
    , request = require('request')
    , dotenv = require('dotenv')
    , striptags = require('striptags')
    , jsonfile = require('jsonfile')
    , _ = require('underscore');

//Load environment variables

/*if (process.env.PRODUCTION){
    
}
else{*/
dotenv.load();
var meetupApiKey = process.env.MEETUP_API_KEY;
var mongolabURI = process.env.MONGOLAB_URI;
//}

// Express settings/config
app.enable('trust proxy');
app.set('view engine', 'ejs');
require('ejs').delimiter = '$';
app.use(bodyParser.json({
    limit: '50mb'
}));
app.use(bodyParser.urlencoded({
    limit: '50mb'
    , extended: true
    , parameterLimit: 10000
}));
app.use(express.static(__dirname + '/public'));


app.get('/', function (req, res) {
    res.render('index');
});


//Called from the client in order to pull data from the DB/Meetup API
app.post('/api/get_meetup_data', function (req, res, next) {

    console.log("POST!");

    var topics = req.body.topics.trim().split(/\s*[,]\s*/);
    console.log(topics);
    //var topics = ["ibm", "ibm bluemix", "bluemix"]; //Find groups with the topic "bluemix"
    console.log("User inputed topics: " + topics);

    getTopicIdsFromMeetupAPI(topics, function (topicList) {

        var topicIdList = createTopicIdList(topicList); //form list of just the valid topic ids
        var invalidTopics = createInvalidTopicsList(topicList); //form list of invalid topics

        if (topicIdList.length == 0) {
            //All topics were invalid
            console.log("No topics found that matched.");
            return res.json({
                topics: []
                , groups: []
                , events: []
                , invalid_topics: invalidTopics
            });
        }
        //If no request to update the cache, then load all groups and events from cached topics in the DB
        if (!req.body.useDBCache) {

            findGroupsAndEventsByTopicInDB(topicList, function (notFoundTopics, topicsFromDB, groupsFromDB, eventsFromDB) {
                if (notFoundTopics.length > 0) {
                    //Only get the data from Meetup API if there were topic ids that were not found in the DB
                    getGroupsAndEventsFromMeetupAPI(notFoundTopics, topicsFromDB, groupsFromDB, eventsFromDB, invalidTopics, function (response) {
                        res.json(response);
                    });
                } else {
                    return res.json({
                        topics: topicsFromDB
                        , groups: groupsFromDB
                        , events: eventsFromDB
                        , invalid_topics: invalidTopics
                    });
                }

            });
        } else {
            console.log("Requested not to use the database cache. Pulling all data from Meetup.com");
            getGroupsAndEventsFromMeetupAPI(topicList, [], [], [], invalidTopics, function (response) {

                if (req.body.saveToDB) {

                    console.log("Requested to save the data in the database.");

                    //Add Groups to the MongoDB database
                    console.log("Adding groups to DB...");
                    addAllGroupsToDB(response.groups, function (err) {
                        if (err) {
                            return console.log("Error adding groups to DB: " + err.message);
                        }
                        console.log("Groups added successfully.");

                        addAllEventsToDB(response.events, function (err) {
                            if (err) {
                                return console.log("Error adding events to DB: " + err.message);
                            }
                            console.log("Events added successfully.");

                            addAllTopicsToDB(response.topics, function (err) {
                                if (err) {
                                    return console.log("Error adding topics to DB: " + err.message);
                                }
                                console.log("Topics added successfully.");

                                res.json(response);

                            });
                        });
                    });
                } else {
                    res.json(response);
                }
            });
        }
    });
});

//Get groups and events based on a topic list. Also pass in topics, groups, and events we already found in the MongoDB
//As well as any invalid_topics that were searched for
function getGroupsAndEventsFromMeetupAPI(topicList, topicsFromDB, groupsFromDB, eventsFromDB, invalid_topics, callback) {

    var topicIdList = createTopicIdList(topicList);

    console.log("Calling get groups from meetup api for these topics: " + _.pluck(topicList, "name"));

    getGroupsByTopicIdsFromMeetupAPI(topicIdList, function (groupList) {

        var groupIdList = createGroupIdList(groupList); //form list of just the group ids

        getEventsByGroupIdListFromMeetupAPI(groupIdList, function (eventList) {

            //Make sure there are no duplicates in the events list
            console.log("Events before deleting duplicates: " + eventList.length);
            eventList = _.uniq(eventList, false, function (e) {
                return e.id
            });
            console.log("Events after deleting duplicates: " + eventList.length);

            //Convert Meetup API JSON into local storage JSON format
            var topicListToSave = formatTopicList(topicList);
            var groupListToSave = formatGroupList(groupList);
            var eventListToSave = formatEventList(eventList);

            //Calculate average events per month for each group
            calculateGroupMetrics(groupListToSave, eventListToSave);
            calculateEventMetrics(eventListToSave);

            //Merge any topics, groups, and events we already had in our DB to the results from meetup API
            topicListToSave = _.union(topicListToSave, topicsFromDB);
            groupListToSave = _.union(groupListToSave, groupsFromDB);
            eventListToSave = _.union(eventListToSave, eventsFromDB);

            console.log("Total api and db combined results: " + topicListToSave.length + " topics, " + groupListToSave.length + " groups, " + eventListToSave.length + " events. ");

            //Now return lists to the client!!
            callback({
                topics: topicListToSave
                , groups: groupListToSave
                , events: eventListToSave
                , invalid_topics: invalid_topics
            });
        });
    });
};



//Using Meetup API, finds "Topic ID"s based on items in the topic list "Topic" and passes it to a callback function
//Needs to make multiple requests to get all topic ids for topics in the list
//Returns -1 as ID for topics it can't find
function getTopicIdsFromMeetupAPI(topics, cb) {

    var resultsToReturn = [];
    var topicsIndex = 0;
    var validTopicsFound = 0;

    var url = 'http://api.meetup.com/topics';

    //Start first request
    (topics.length > 0) ? launchEventsRequest(topics[topicsIndex]): console.log("no topic Ids provided");

    function eventsRequestCallback(error, response, body) {

        if (!error && response.statusCode == 200) {

            var bodyObj = JSON.parse(response.body);

            if (bodyObj.results.length != 0) {
                resultsToReturn.push({
                    id: bodyObj.results[0].id
                    , name: bodyObj.results[0].name
                }); //append topic id of first result to the array to return

                console.log("Success topic find: " + bodyObj.results[0].name);
                validTopicsFound++;

            } else {
                console.log("No match found for the topic: " + topics[topicsIndex]);
                resultsToReturn.push({
                    id: -1
                    , name: topics[topicsIndex]
                }); //append topic id of first result to the array to return
            }

            //Launch another request for the next topic Id if there are more topics left to search for
            if (++topicsIndex < topics.length) {
                launchEventsRequest(topics[topicsIndex]);
                return;
            } else {
                console.log("Total topics found: " + validTopicsFound + " of " + resultsToReturn.length);
                return cb(resultsToReturn);
            }

        } else if (error) {
            return console.log("Topics find Error: " + error);
        } else {
            return console.log("Find topics Status code: " + response.statusCode + ": " + response.body);
        }
    }

    function launchEventsRequest(topic) {
        request({
                method: 'GET'
                , url: url
                , qs: {
                    name: topic
                    , key: meetupApiKey
                    , page: 20
                }
            }
            , eventsRequestCallback
        )
    }

}

//Using Meetup API, finds a list of groups based on a "Topic ID" and passes it to a callback function
function getGroupsByTopicIdsFromMeetupAPI(topic_id_list, cb) {
    console.log("Group find request");

    var topicIdList = topic_id_list;

    var topicIdString = topicIdList.join();

    var url = 'http://api.meetup.com/find/groups';

    //The max page size is 200, make multiple requests in a row to gather all events
    var offset = 0;
    var resultsToReturn = [];

    //Start first request
    launchGroupsRequest(0);

    function groupsRequestCallback(error, response, body) {

        if (!error && response.statusCode == 200) {
            console.log("Success group find offset: " + offset);

            var bodyObj = JSON.parse(response.body);

            //console.log(bodyObj);

            //console.log(Object.keys(response.headers));
            //console.log(response.headers['x-rate-limit-limit']);
            //console.log(response.headers['x-rate-limit-remaining']);
            //console.log(response.headers['x-rate-limit-reset']);

            var link;
            (response.headers.link) ? link = response.headers.link: link = "";
            var totalCount = response.headers['x-total-count'];

            //console.log(Object.keys(bodyObj));
            Array.prototype.push.apply(resultsToReturn, bodyObj); //append new results to the array to return
            //console.log("Results to return" + resultsToReturn);

            console.log("Group total count: " + totalCount);

            //Launch another request with an incremented offset if the previous result's metadata has a "next url" listed
            if (link.includes("next") && offset < 4) {
                offset++;
                launchGroupsRequest(offset);
                return;
            } else {
                if (offset >= 4) console.log("Group cap of 1000 reached.");
                console.log("Total groups found: " + resultsToReturn.length);
                //console.log(resultsToReturn);
                return cb(resultsToReturn);
            }
        } else if (error) {
            return console.log("Error: " + error);
        } else {
            return console.log("Find Groups Status code: " + response.statusCode + ": " + response.body);
        }
    }

    function launchGroupsRequest(offset) {
        request({
                method: 'GET'
                , url: url
                , qs: {
                    topic_id: topicIdString
                    , key: meetupApiKey
                    , page: 200
                    , offset: offset
                    , fields: "topics"
                    , radius: "global"
                        /*, country: "US"*/
                }
            }
            , groupsRequestCallback
        )
    }

};

function getEventsByGroupIdListFromMeetupAPI(group_id_list, cb) {

    console.log("Event find request");

    var allEventsList = [];

    //Since max size for group_id_list is 200, we have to seperate the list up and only call with 200 at a time
    var groupIdList = group_id_list;

    var chunkStartIndex = 0;
    //Request with first 200 groups in list
    launch200GroupIdsRequest(chunkStartIndex);

    function launch200GroupIdsRequestCallback(results) {
        Array.prototype.push.apply(allEventsList, results);

        //condition to launch another groupId request
        if (chunkStartIndex + 200 < groupIdList.length) {
            chunkStartIndex += 200; //Increment the chunk index
            launch200GroupIdsRequest(chunkStartIndex);
        } else {
            console.log("Total events found: " + allEventsList.length);
            cb(allEventsList);
        }
    }

    function launch200GroupIdsRequest(index) {
        //Convert this list into comma seperated string
        var groupIdString = groupIdList.slice(index, index + 200).join();

        //console.log(groupIdList.slice(index, index+200));

        console.log("Finding events for " + groupIdList.slice(index, index + 200).length + " groups...");

        var url = 'http://api.meetup.com/2/events';

        //The max page size is 200, make multiple requests in a row to gather all events
        var offset = 0;
        var resultsToReturn = [];

        //Start first request
        launchEventsRequest(offset);

        function eventsRequestCallback(error, response, body) {

            if (!error && response.statusCode == 200) {
                console.log("Success event find offset: " + offset);
                var bodyObj = JSON.parse(response.body);

                Array.prototype.push.apply(resultsToReturn, bodyObj.results); //append new results to the array to return

                console.log("Events count for this batch: " + bodyObj.meta.total_count);

                //Launch another request with an incremented offset if the previous result's metadata has a "next url" listed
                if (bodyObj.meta.next && offset < 14) { //this offset check caps events at 3000 results for each "batch" of 200 groups
                    offset++;
                    launchEventsRequest(offset);
                    return;
                } else {
                    if (offset >= 14) console.log("Event cap of 3000 reached.");
                    console.log("Events found in this batch: " + resultsToReturn.length);
                    return launch200GroupIdsRequestCallback(resultsToReturn);
                }


            } else if (error) {
                return console.log("Error: " + error);
            } else {
                return console.log("Find Events Status code: " + response.statusCode + ": " + response.body);
            }
        }

        function launchEventsRequest(offset) {
            request({
                    method: 'GET'
                    , url: url
                    , qs: {
                        group_id: groupIdString
                        , key: meetupApiKey
                        , page: 200
                        , offset: offset
                        , limited_events: true
                        , status: "past"
                        , time: "-6m,0d"
                        , desc: "true"
                        , text_format: "plain"
                    }
                    //can add "upcoming" seperated by a comma to "status" to include those as well.
                    //"-6m,0d" means events are only from 6 months ago or later
                }
                , eventsRequestCallback
            )
        }
    }


};


//Testing Mongo
var mongoose = require('mongoose');
mongoose.connect(mongolabURI, function (err, res) {
    if (err) {
        console.log('ERROR connecting to MongoLab');
    } else {
        console.log('Succeeded connecting to MongoLab');
    }
});

var db = mongoose.connection;

var EventSchema = require('./models/Event.js').EventSchema;
var Event = db.model('events', EventSchema);

var GroupSchema = require('./models/Group.js').GroupSchema;
var Group = db.model('groups', GroupSchema);

var TopicSchema = require('./models/Topic.js').TopicSchema;
var Topic = db.model('topics', TopicSchema);

function addAllEventsToDB(eventList, cb) {
    Event.collection.drop();
    Event.collection.insert(eventList, function (err, docs) {
        if (err) {
            return cb({
                message: "Error adding events to DB" + err.message
            });
        } else {
            return cb();
        }
    })
};

function addAllGroupsToDB(groupList, cb) {

    //update the database!
    Group.collection.drop(); //delete old groups 
    Group.collection.insert(groupList, function (err, docs) {
        if (err) {
            return cb({
                message: "Error adding groups to DB"
            });
        } else {
            return cb();
        }
    });
};

function addAllTopicsToDB(topicList, cb) {

    //update the database!
    Topic.collection.drop(); //delete old groups 
    Topic.collection.insert(topicList, function (err, docs) {
        if (err) {
            return cb({
                message: "Error adding topics to DB"
            });
        } else {
            return cb();
        }
    });
};

function findGroupsAndEventsByTopicInDB(topicList, cb) {
    //returns cb( reducedTopicList, groupList, eventList),
    //where reducedTopicList consists of topics that WEREN'T found
    //var topic_ids = topicIdList.map(Number);

    var topicList = formatTopicList(topicList);

    var topicIdList = createTopicIdList(topicList);

    //console.log("*********" + topicIdList);

    Topic.collection.find({
        _id: {
            $in: topicIdList
        }
    }).toArray(function (err, foundTopics) {
        if (err) {
            console.log(err);
        } else {
            var foundTopicIds = _.pluck(foundTopics, "_id");

            //console.log("doing a difference of these 2 list: " + topicIdList + " *** " + foundTopicIds);

            var notFoundTopicIds = _.difference(topicIdList, foundTopicIds);
            var notFoundTopics = getTopicsByIds(topicList, notFoundTopicIds);

            console.log("Found these topics already in DB: " + _.pluck(foundTopics, "name"));
            console.log("Did NOT find these topics already in DB: " + _.pluck(notFoundTopics, "name"));
            //console.log("Did NOT find these topic ids already in DB: " + notFoundTopicIds);


            Group.collection.find({
                topics: {
                    $elemMatch: {
                        id: {
                            $in: foundTopicIds
                        }
                    }
                }
            }).toArray(function (err, foundGroups) {
                if (err) {
                    console.log(err);
                } else {
                    //console.log(result);
                    console.log("Found " + foundGroups.length + " groups already in DB.");

                    var foundGroupIds = _.pluck(foundGroups, "_id");

                    Event.collection.find({
                        group_id: {
                            $in: foundGroupIds
                        }
                    }).toArray(function (err, foundEvents) {
                        if (err) {
                            console.log(err);
                        } else {
                            //console.log(result);
                            console.log("Found " + foundEvents.length + " events already in DB.");
                            return cb(notFoundTopics, foundTopics, foundGroups, foundEvents);
                        }
                    });

                }
            });
        }
    });
}

var formatGroupList = function (list) {

    for (var i = 0; i < list.length; i++) {
        //Delete unneccessary properties
        list[i].score && delete list[i].score;
        list[i].link && delete list[i].link;
        list[i].join_mode && delete list[i].join_mode;
        list[i].visibility && delete list[i].visibility;
        list[i].organizer && delete list[i].organizer;
        list[i].next_event && delete list[i].next_event;
        list[i].category && delete list[i].category;
        list[i].photos && delete list[i].photos;
        list[i].group_photo && delete list[i].group_photo;
        list[i].who && delete list[i].who;

        if (list[i].description) { //strip html tags
            list[i].description = striptags(list[i].description);
        }

        var reducedTopicIdList = [];
        if (list[i].topics) {
            //Add all topics
            for (var j = 0; j < list[i].topics.length; j++) {
                reducedTopicIdList.push({
                    id: list[i].topics[j].id
                    , name: list[i].topics[j].name
                });
            }
        }
        list[i].topics = reducedTopicIdList;


        /* if (list[i].created){ //change creation date into Date object
             var createdDate = new Date();
             createdDate.setTime(list[i].created);
             list[i].created = createdDate;
         }*/

        list[i]._id = list[i].id;
        delete list[i].id;

    }
    return list;
}

var formatEventList = function (list) {
    for (var i = 0; i < list.length; i++) {
        //Delete unneccessary properties
        list[i].announced && delete list[i].announced;
        list[i].distance && delete list[i].distance;
        list[i].featured && delete list[i].featured;
        list[i].fee && delete list[i].fee;
        if (list[i].group) {
            list[i].group_id = list[i].group.id;
            list[i].group_name = list[i].group.name;
            delete list[i].group;
        }
        list[i].how_to_find_us && delete list[i].how_to_find_us;
        list[i].is_simplehtml && delete list[i].is_simpleHTML;
        list[i].photo_url && delete list[i].photo_url;
        list[i].publish_status && delete list[i].publish_status;
        list[i].rsvp_limit && delete list[i].rsvp_limit;
        list[i].simple_html_description && delete list[i].simple_html_description;
        list[i].waitlist_count && delete list[i].waitlist_count;

        if (list[i].venue) {
            list[i].lat = list[i].venue.lat;
            list[i].lon = list[i].venue.lon;
            list[i].city = list[i].venue.city;
            list[i].state = list[i].venue.state;
            list[i].country = list[i].venue.country;
            delete list[i].venue;
        }

        if (list[i].description) { //strip html tags
            list[i].description = striptags(list[i].description);
        }
        //Format "hosts" list (delete photo links)
        if (list[i].event_hosts) {
            for (var j = 0; j < list[i].event_hosts.length; j++) {
                list[i].event_hosts[j].photo && delete list[i].event_hosts[j].photo;
            }
        }

        list[i]._id = list[i].id;
        delete list[i].id;
    }
    return list;
}

var formatTopicList = function (list) {
    for (var i = 0; i < list.length; i++) {
        if (list[i].id) {
            list[i]._id = parseInt(list[i].id);
            delete list[i].id;
        }
    }
    return list;
}

var createGroupIdList = function (groupList) {
    var groupIdList = [];

    for (var i = 0; i < groupList.length; i++) {
        groupIdList.push(groupList[i].id);
    }

    return groupIdList;
}

var createTopicIdList = function (topicList) {
    var topicIdList = [];

    for (var i = 0; i < topicList.length; i++) {
        //works for both "id" and "_id" format
        if (topicList[i].id && topicList[i].id != -1) topicIdList.push(parseInt(topicList[i].id));
        else if (topicList[i]._id && topicList[i]._id != -1) topicIdList.push(parseInt(topicList[i]._id));
    }

    return topicIdList;
}

var createInvalidTopicsList = function (topicList) {
    var invalidTopicList = [];

    for (var i = 0; i < topicList.length; i++) {
        if (topicList[i].id == -1) invalidTopicList.push(topicList[i].id);
    }

    return invalidTopicList;
}

//Returns a list of topics that are in the topic IDs list
var getTopicsByIds = function (topicList, topicIdsList) {

    var ret = [];

    console.dir(topicList);
    //console.log("%%%%%" + topicIdsList);

    for (var i = 0; i < topicList.length; i++) {
        //console.log("This topics id:" + topicList[i]._id);
        if (topicIdsList.indexOf(topicList[i]._id) != -1) ret.push(topicList[i]);
    }

    return ret;

}


function calculateGroupMetrics(groupList, eventList) {
    var currentDate = new Date();
    var currentMonth = currentDate.getUTCMonth();
    var currentYear = currentDate.getUTCFullYear();

    //Array contains: [ first day of the current month, 1st day of last month, ... , 1st day of 6 months ago] ( 7 entries ) 
    var datesLast6Months = [];
    for (var monthsAgo = 0; monthsAgo <= 6; monthsAgo++) {
        datesLast6Months.push(new Date(currentYear, currentMonth - monthsAgo, 1, 0, 0, 0).getTime());
    }

    var i, j;
    for (i = 0; i < groupList.length; i++) {

        var groupId = groupList[i]._id;

        //Keep track of the number of events [last month, two months ago, ... , 6 months ago ] ( excludes current month, so 6 entries )
        var eventsLast6Months = [0, 0, 0, 0, 0, 0];
        var yesRSVPsLast6Months = [];
        var eventsEachDayOfWeek = [0, 0, 0, 0, 0, 0, 0];
        var yesRSVPsEachDayOfWeek = [[], [], [], [], [], [], []];

        var eventsEachHourWeekDays = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; //length 15 (starting at 8am)
        var yesRSVPsEachHourWeekDays = [[], [], [], [], [], [], [], [], [], [], [], [], [], [], []];


        for (j = 0; j < eventList.length; j++) {

            // Check to see if this event is in this group
            if (eventList[j].group_id == groupId) {

                var eventDateMS = eventList[j].time + eventList[j].utc_offset; //eventDateMS is ms since epoch

                //Calculate events by month
                if (eventDateMS > datesLast6Months[0]) {
                    //Event is in the current month, so cannot calculate an average
                    continue;
                } else if (eventDateMS > datesLast6Months[1]) {
                    //Event was last month
                    eventsLast6Months[0]++;
                    yesRSVPsLast6Months.push(eventList[j].yes_rsvp_count);
                } else if (eventDateMS > datesLast6Months[2]) {
                    //Event was 2 months ago
                    eventsLast6Months[1]++;
                    yesRSVPsLast6Months.push(eventList[j].yes_rsvp_count);
                } else if (eventDateMS > datesLast6Months[3]) {
                    //Event was 3 months ago
                    eventsLast6Months[2]++;
                    yesRSVPsLast6Months.push(eventList[j].yes_rsvp_count);
                } else if (eventDateMS > datesLast6Months[4]) {
                    //Event was 4 months ago
                    eventsLast6Months[3]++;
                    yesRSVPsLast6Months.push(eventList[j].yes_rsvp_count);
                } else if (eventDateMS > datesLast6Months[5]) {
                    //Event was 5 months ago
                    eventsLast6Months[4]++;
                    yesRSVPsLast6Months.push(eventList[j].yes_rsvp_count);
                } else if (eventDateMS > datesLast6Months[6]) {
                    //Event was 6 months ago
                    eventsLast6Months[5]++;
                    yesRSVPsLast6Months.push(eventList[j].yes_rsvp_count);
                }

                //Calculate events by day of the week
                var eventDate = new Date(eventDateMS);
                //Increment appropriate day of the week the event is scheduled on

                var eventDay = eventDate.getUTCDay();
                eventsEachDayOfWeek[eventDay]++;
                //Add the number of attendees to the day of the week
                yesRSVPsEachDayOfWeek[eventDay].push(eventList[j].yes_rsvp_count);

                if (eventDay >= 1 && eventDay <= 5) { //check if its a weekday

                    var eventHour = eventDate.getUTCHours();

                    var hourIndex = eventHour - 8; //hours stored in array with index zero being 8am

                    if (hourIndex < 15 && hourIndex >= 0) { //make sure hour is between 8am and 10pm

                        eventsEachHourWeekDays[hourIndex]++;
                        yesRSVPsEachHourWeekDays[hourIndex].push(eventList[j].yes_rsvp_count);
                    }


                }
            }
        }

        var averageEventsPerMonth = Math.round((eventsLast6Months.reduce(add, 0) / 6) * 100) / 100;
        var averageYesRSVPsPerEventLast6Months = 0;
        if (yesRSVPsLast6Months.length != 0) {
            averageYesRSVPsPerEventLast6Months = Math.round((yesRSVPsLast6Months.reduce(add, 0) / yesRSVPsLast6Months.length) * 100) / 100;
        }
        var avgParticipationRate = Math.round((averageYesRSVPsPerEventLast6Months / groupList[i].members) * 100) / 100;

        var averageYesRSVPsEachDayOfWeek = [null, null, null, null, null, null, null];
        for (var j = 0; j < yesRSVPsEachDayOfWeek.length; j++) {
            //Check that there were events on that day of the week, then assign an average
            if (yesRSVPsEachDayOfWeek[j].length != 0) {
                averageYesRSVPsEachDayOfWeek[j] = Math.round((yesRSVPsEachDayOfWeek[j].reduce(add, 0) / yesRSVPsEachDayOfWeek[j].length) * 100) / 100;
            }
            //If there were no events that day, the average yes RSVPs for that day remains null
        }

        var attendanceEachDayOfWeekRelativeToGroupAverage = [null, null, null, null, null, null, null];
        //Calculate daily attendance relative to the group's average (% above or below average)
        for (var j = 0; j < averageYesRSVPsEachDayOfWeek.length; j++) {
            //Check that there were events on that day of the week, then assign an average
            if (averageYesRSVPsEachDayOfWeek[j] != null) {
                attendanceEachDayOfWeekRelativeToGroupAverage[j] = Math.round(((averageYesRSVPsEachDayOfWeek[j] - averageYesRSVPsPerEventLast6Months) / averageYesRSVPsPerEventLast6Months) * 100) / 100;
            }
            //If there were no events that day, the attendance relative to group's average remains null
        }

        var averageYesRSVPsEachHourWeekDays = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
        for (var j = 0; j < yesRSVPsEachHourWeekDays.length; j++) {
            //Check that there were events at that hour, then assign an average
            if (yesRSVPsEachHourWeekDays[j].length != 0) {
                averageYesRSVPsEachHourWeekDays[j] = Math.round((yesRSVPsEachHourWeekDays[j].reduce(add, 0) / yesRSVPsEachHourWeekDays[j].length) * 100) / 100;
            }
            //If there were no events at that hour, the average yes RSVPs for that hour remains null
        }

        var attendanceEachHourWeekDaysRelativeToGroupAverage = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
        //Calculate attendance at each time relative to the group's average (% above or below average)
        for (var j = 0; j < averageYesRSVPsEachHourWeekDays.length; j++) {
            //Check that there were events on that day of the week, then assign an average
            if (averageYesRSVPsEachHourWeekDays[j] != null) {
                attendanceEachHourWeekDaysRelativeToGroupAverage[j] = Math.round(((averageYesRSVPsEachHourWeekDays[j] - averageYesRSVPsPerEventLast6Months) / averageYesRSVPsPerEventLast6Months) * 100) / 100;
            }
            //If there were no events that day, the attendance relative to group's average remains null
        }

        groupList[i].avg_yes_rsvps_per_event_last_6_months = averageYesRSVPsPerEventLast6Months;
        groupList[i].avg_events_per_month_last_6_months = averageEventsPerMonth;
        groupList[i].num_events_last_6_months = eventsLast6Months;
        groupList[i].avg_participation_rate = avgParticipationRate;

        groupList[i].num_events_each_day_of_week = eventsEachDayOfWeek;
        groupList[i].avg_yes_rsvps_per_event_each_day_of_week = averageYesRSVPsEachDayOfWeek;
        groupList[i].percentage_attendance_each_day_of_week_rel_to_group_avg = attendanceEachDayOfWeekRelativeToGroupAverage;

        groupList[i].num_events_each_hour_weekdays_from_8AM = eventsEachHourWeekDays;
        groupList[i].avg_yes_rsvps_per_event_weekdays_by_hour_from_8AM = averageYesRSVPsEachHourWeekDays;
        groupList[i].percentage_attendance_each_hour_from_8AM_rel_to_group_avg = attendanceEachHourWeekDaysRelativeToGroupAverage;
    }
}

function calculateEventMetrics(eventList) {

    for (var i = 0; i < eventList.length; i++) {

        //Calculate the amount of "heads up time" that was given about the event in days
        var headsUpTime = Math.floor((eventList[i].time - eventList[i].created) / 1000 / 60 / 60 / 24);

        eventList[i].heads_up_time = headsUpTime;
    }

}

//Utility add function to help calculate sums of arrays
function add(a, b) {
    return a + b;
}

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);