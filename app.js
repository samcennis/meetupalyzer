'use strict';

var express     = require('express'),
    app         = express(),
    watson      = require('watson-developer-cloud'),
    bodyParser  = require('body-parser'),
    request     = require('request'),
    dotenv      = require('dotenv'),
    striptags   = require('striptags'),
    jsonfile    = require('jsonfile'),
    _           = require('underscore');

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
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 10000 }));
app.use(express.static(__dirname + '/public'));


app.get('/', function(req, res) {
  res.render('index');
});


//Called from the client in order to pull data from Meetup, add it to the DB, and create a local JSON file
app.post('/api/update_meetup_data', function(req,res,next) {
    
    console.log("POST!");
    
    var topics = ["racquetball"]; //Find groups with the topic "bluemix"
    
    getTopicIdsFromMeetupAPI(topics, function(topicIDList){
        
        getGroupsByTopicIdsFromMeetupAPI(topicIDList, function(groupList){
                
            var groupIdList = createGroupIdList(groupList); //form list of just the group ids
            
            getEventsByGroupIdListFromMeetupAPI(groupIdList, function(eventList){
            
                //Make sure there are no duplicates in the events list
                console.log("Events before deleting duplicates: " + eventList.length);
                eventList= _.uniq(eventList, false, function(e){return e.id}); 
                console.log("Events after deleting duplicates: " + eventList.length);
                
                //Convert Meetup API JSON into local storage JSON format
                var groupListToSave = formatGroupList(groupList);
                var eventListToSave = formatEventList(eventList);
                
                //Calculate average events per month for each group
                calculateEventMetricsForGroups( groupList, eventList );

                
                //Write Groups to local JSON file
                console.log("Writing groups.json local file...");
                var groupJSONFile = __dirname + '/public/meetup_data/groups.json';
                jsonfile.writeFile(groupJSONFile, groupListToSave, function (err) {
                    if (err){
                        return console.log("Error writing groups.json local file: " + err);
                    }
                    console.log("Groups.json written successfully.");
                    
                    //Write Events to local JSON file
                    console.log("Writing events.json local file...");
                    var eventJSONFile = __dirname + '/public/meetup_data/events.json';
                    jsonfile.writeFile(eventJSONFile, eventListToSave, function (err) {
                        if (err){
                            return console.log("Error writing events.json local file: " + err);
                        }
                        console.log("Events.json written successfully.");
                        
                        //Add Groups to the MongoDB database
                        console.log("Adding groups to DB...");
                        addAllGroupsToDB(groupListToSave, function(err){
                            if (err){
                                return console.log("Error adding groups to DB: " + err.message); 
                            }
                            console.log("Groups added successfully.");
                        
                            addAllEventsToDB(eventListToSave, function(err){
                                if (err){
                                    return console.log("Error adding events to DB: " + err.message); 
                                }
                                console.log("Events added successfully.");
                            }); 
                        });  
                    }); 
                });       
            });                    
        });     
    });
});


//Using Meetup API, finds "Topic ID"s based on items in the topic list "Topic" and passes it to a callback function
//Needs to make multiple requests to get all topic ids for topics in the list
function getTopicIdsFromMeetupAPI(topics, cb){
    
    var resultsToReturn = [];
    var topicsIndex = 0;
    
    var url = 'http://api.meetup.com/topics';
    
    //Start first request
    (topics.length > 0) ? launchEventsRequest(topics[topicsIndex]) : console.log("no topic Ids provided"); 
 
    function eventsRequestCallback (error, response, body) {
        
        if (!error && response.statusCode == 200) {
            
            var bodyObj = JSON.parse(response.body);

            if ( bodyObj.results.length != 0 ){
                resultsToReturn.push(bodyObj.results[0].id); //append topic id of first result to the array to return

                console.log("Success topic find: " + bodyObj.results[0].name );
                
            }
            else{
                console.log("No match found for this topic.");
            }
            
            //Launch another request for the next topic Id if there are more topics left to search for
            if (++topicsIndex < topics.length ){
                launchEventsRequest(topics[topicsIndex]);
                return;
            }
            else{
                console.log("No more topics left to search for. Results length is: " + resultsToReturn.length);
                return cb(resultsToReturn);
            }
       
        }    
        else if (error){
            return console.log("Topics find Error: " + error);
        }
        else{
            return console.log("Find topics Status code: " + response.statusCode + ": " + response.body);
        }
    }
        
    function launchEventsRequest(topic){
        request({
            method: 'GET', 
            url: url,
            qs: {name: topic, key: meetupApiKey, page: 20}
            }, 
            eventsRequestCallback 
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
    
    function groupsRequestCallback (error, response, body) {
        
        if (!error && response.statusCode == 200) {
            console.log("Success group find offset: " + offset);
            
            var bodyObj = JSON.parse(response.body);
            
            //console.log(bodyObj);
            
            //console.log(Object.keys(response.headers));
            //console.log(response.headers['x-rate-limit-limit']);
            //console.log(response.headers['x-rate-limit-remaining']);
            //console.log(response.headers['x-rate-limit-reset']);
            
            var link;
            (response.headers.link) ? link = response.headers.link : link = "";
            var totalCount = response.headers['x-total-count'];
                
            //console.log(Object.keys(bodyObj));
            Array.prototype.push.apply(resultsToReturn, bodyObj); //append new results to the array to return
            //console.log("Results to return" + resultsToReturn);
            
            console.log("Group total count: " + totalCount);
            
            //Launch another request with an incremented offset if the previous result's metadata has a "next url" listed
            if (link.includes("next")){
                offset++;
                launchGroupsRequest(offset);
                return;
            }
            else{
                console.log("No more groups left. Results length is: " + resultsToReturn.length);
                //console.log(resultsToReturn);
                return cb(resultsToReturn);
            }         
        }    
        else if (error){
            return console.log("Error: " + error);
        }
        else{
            return console.log("Find Groups Status code: " + response.statusCode + ": " + response.body);
        }
    }
    
    function launchGroupsRequest(offset){
        request({
                method: 'GET', 
                url: url,
                qs: {topic_id: topicIdString, key: meetupApiKey, page: 200, offset: offset, radius: "global", page: 200}
            },
            groupsRequestCallback
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
    
    function launch200GroupIdsRequestCallback(results){
        Array.prototype.push.apply(allEventsList, results);
        
        //condition to launch another groupId request
        if (chunkStartIndex + 200 < groupIdList.length){
            chunkStartIndex += 200; //Increment the chunk index
            launch200GroupIdsRequest(chunkStartIndex);
        }
        else {
            console.log("Total events found: " + allEventsList.length );
            cb(allEventsList);
        }
    }
    
    function launch200GroupIdsRequest(index) {
        //Convert this list into comma seperated string
        var groupIdString = groupIdList.slice(index, index+200).join();

        console.log("Finding events for " + groupIdList.slice(index, index+200).length + " groups...");

        var url = 'http://api.meetup.com/2/events';

        //The max page size is 200, make multiple requests in a row to gather all events
        var offset = 0;
        var resultsToReturn = [];

        //Start first request
        launchEventsRequest(offset); 

        function eventsRequestCallback (error, response, body) {

            if (!error && response.statusCode == 200) {
                console.log("Success event find offset: " + offset);
                var bodyObj = JSON.parse(response.body);

                Array.prototype.push.apply(resultsToReturn, bodyObj.results); //append new results to the array to return

                console.log("Events total count: " + bodyObj.meta.total_count);

                //Launch another request with an incremented offset if the previous result's metadata has a "next url" listed
                if (bodyObj.meta.next){
                    offset++;
                    launchEventsRequest(offset);
                    return;
                }
                else{
                    console.log("Events found in this batch: " + resultsToReturn.length);
                    return launch200GroupIdsRequestCallback(resultsToReturn);
                }


            }    
            else if (error){
                return console.log("Error: " + error);
            }
            else{
                return console.log("Find Events Status code: " + response.statusCode + ": " + response.body);
            }
        }

        function launchEventsRequest(offset){
            request({
                method: 'GET', 
                url: url,
                qs: {group_id: groupIdString, key: meetupApiKey, page: 200, offset: offset, limited_events: true, status: "upcoming,past", text_format: "plain"}
                }, 
                eventsRequestCallback 
            )  
        }
    }
    
        
};


//Testing Mongo
var mongoose = require('mongoose');
mongoose.connect(mongolabURI, function (err, res) {
    if (err) { 
        console.log ('ERROR connecting to MongoLab');
    } else {
        console.log ('Succeeded connecting to MongoLab');
    }
});

var db = mongoose.connection;

var EventSchema = require('./models/Event.js').EventSchema;
var Event = db.model('events', EventSchema);

var GroupSchema = require('./models/Group.js').GroupSchema;
var Group = db.model('groups', GroupSchema);

function addAllEventsToDB(eventList, cb){
    Event.collection.drop();
    Event.collection.insert(eventList, function(err, docs){
        if (err) {
            return cb({message: "Error adding events to DB" + err.message});
        }else{
            return cb();
        }
    })
};

function addAllGroupsToDB(groupList, cb){
      
    //update the database!
    Group.collection.drop(); //delete old groups 
    Group.collection.insert(groupList, function(err, docs){
        if (err) {
            return cb({message: "Error adding groups to DB"});
        } else {
            return cb();
        }
    });
  
   /* var bulk = Group.collection.initializeOrderedBulkOp();
    for (var i = 0; i < groupList.length; i++){
        bulk.find({ _id : groupList[i]._id}).upsert().updateOne(groupList[i]);
    }
    
    bulk.execute(function(err, results){
        if (err) { console.log("error: " + err.message)};
        console.log(results.nInserted + " docs inserted and " + results.nModified + " modified.")
    });*/
 
};

var formatGroupList = function(list){
    for (var i=0; i < list.length; i++){
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
        
        if (list[i].description){ //strip html tags
            list[i].description = striptags(list[i].description);
        }
        
        
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

var formatEventList = function(list){
    for (var i=0; i < list.length; i++){
        //Delete unneccessary properties
        list[i].announced && delete list[i].announced;
        list[i].distance && delete list[i].distance;
        list[i].featured && delete list[i].featured;
        list[i].fee && delete list[i].fee;
        if(list[i].group){
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
        
        if (list[i].venue){
            list[i].lat = list[i].venue.lat;
            list[i].lon = list[i].venue.lon;
            list[i].city = list[i].venue.city;
            list[i].state = list[i].venue.state;
            list[i].country = list[i].venue.country;
            delete list[i].venue;
        }
        
        if (list[i].description){ //strip html tags
            list[i].description = striptags(list[i].description);
        }
        //Format "hosts" list (delete photo links)
        if (list[i].event_hosts){
            for (var j=0; j < list[i].event_hosts.length; j++){
                list[i].event_hosts[j].photo && delete list[i].event_hosts[j].photo;
            }
        }
        
        list[i]._id = list[i].id;
        delete list[i].id;    
    }
    return list;
}

var createGroupIdList = function(groupList){
    var groupIdList = [];
    
    for (var i=0; i < groupList.length; i++){
        groupIdList.push(groupList[i].id);
    }   
    
    return groupIdList;
}


function calculateEventMetricsForGroups( groupList, eventList ){
    var currentDate = new Date();
    var currentMonth = currentDate.getUTCMonth();
    var currentYear = currentDate.getUTCFullYear();
    
    //Array contains: [ first day of the current month, 1st day of last month, ... , 1st day of 6 months ago] ( 7 entries ) 
    var datesLast6Months = [];
    var monthsAgo;
    for ( monthsAgo = 0; monthsAgo <= 6; monthsAgo++){
        datesLast6Months.push( new Date(currentYear, currentMonth - monthsAgo, 1, 0, 0, 0).getTime() );
    }
    
    //console.log(datesLast6Months);

    var i, j;
    for (i = 0; i < groupList.length; i++ ) {
        
        var groupId = groupList[i]._id;
        
        //Keep track of the number of events [last month, two months ago, ... , 6 months ago ] ( excludes current month, so 6 entries )
        var eventsLast6Months = [0,0,0,0,0,0];
        var yesRSVPs = [];
              
        for ( j = 0; j < eventList.length; j++){
            
            // Check to see if this event is in this group
            if (eventList[j].group_id == groupId) {
                
                var eventDate = eventList[j].time; //eventDate is ms since epoch
                
                if ( eventDate > datesLast6Months[0] ){
                    //Event is in the current month, so cannot calculate an average
                    continue;
                } else if ( eventDate > datesLast6Months[1] ) {
                    //Event was last month
                    eventsLast6Months[0]++;
                    yesRSVPs.push(eventList[j].yes_rsvp_count);
                } else if ( eventDate > datesLast6Months[2] ) {
                    //Event was 2 months ago
                    eventsLast6Months[1]++;
                    yesRSVPs.push(eventList[j].yes_rsvp_count);
                } else if ( eventDate > datesLast6Months[3] ) {
                    //Event was 3 months ago
                    eventsLast6Months[2]++;
                    yesRSVPs.push(eventList[j].yes_rsvp_count);
                } else if ( eventDate > datesLast6Months[4] ) {
                    //Event was 4 months ago
                    eventsLast6Months[3]++;
                    yesRSVPs.push(eventList[j].yes_rsvp_count);
                } else if ( eventDate > datesLast6Months[5] ) {
                    //Event was 5 months ago
                    eventsLast6Months[4]++;
                    yesRSVPs.push(eventList[j].yes_rsvp_count);
                } else if ( eventDate > datesLast6Months[6] ) {
                    //Event was 6 months ago
                    eventsLast6Months[5]++;
                    yesRSVPs.push(eventList[j].yes_rsvp_count);
                }    
            }    
        }
        
        var averageEventsPerMonth = Math.round ( ( eventsLast6Months.reduce(add, 0) / 6) * 100 ) / 100;
        var averageYesRSVPsPerEvent = 0;
        if (yesRSVPs.length != 0) {
            averageYesRSVPsPerEvent = Math.round ( ( yesRSVPs.reduce(add, 0) / yesRSVPs.length) * 100 ) / 100;
        }
        
        var avgParticipationRate = Math.round ( ( averageYesRSVPsPerEvent / groupList[i].members ) * 100 ) / 100;
        
        groupList[i].avg_yes_rsvps_per_event_last_6_months = averageYesRSVPsPerEvent;
        groupList[i].avg_events_per_month_last_6_months = averageEventsPerMonth;
        groupList[i].num_events_last_6_months = eventsLast6Months;
        groupList[i].avg_participation_rate = avgParticipationRate;
        
    }  
}

//Utility add function to help calculate sums of arrays
function add(a, b) {
    return a + b;
}

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);





