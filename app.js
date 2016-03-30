'use strict';

var express     = require('express'),
    app         = express(),
    watson      = require('watson-developer-cloud'),
    bodyParser  = require('body-parser'),
    request     = require('request'),
    dotenv      = require('dotenv'),
    striptags   = require('striptags'),
    jsonfile    = require('jsonfile');

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
    
    var topic = "Bluemix"; //Find groups with the topic "bluemix"
    
    getTopicIdFromMeetupAPI(topic, function(topicID){
        
        getGroupsByTopicIdFromMeetupAPI(topicID, function(groupList){
                
            var groupIdList = createGroupIdList(groupList); //form list of just the group ids
            
            getEventsByGroupIdListFromMeetupAPI(groupIdList, function(eventList){
            
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


//Using Meetup API, finds "Topic ID" based on a "Topic" and passes it to a callback function
function getTopicIdFromMeetupAPI(topic, cb){
    var url = 'http://api.meetup.com/topics';
    request({
        method: 'GET', 
        url: url,
        qs: {name: topic, key: meetupApiKey, page: 20}
        }, 
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log("Success topic find!");
                var bodyObj = JSON.parse(response.body);
                if (bodyObj.results.length == 0){
                    return console.log("No matching results.");
                }
                else{
                    return cb(bodyObj.results[0].id);
                }
            }    
            else if (error){
                return console.log("Error: " + error);
            }
            else{
                return console.log("Find topics Status code: " + response.statusCode + ": " + response.body);
            }
        } 
    )  
}

//Using Meetup API, finds a list of groups based on a "Topic ID" and passes it to a callback function
function getGroupsByTopicIdFromMeetupAPI(topic_id, cb) {
    console.log("Group find request");
    var url = 'http://api.meetup.com/find/groups';
    request({
        method: 'GET', 
        url: url,
        qs: {topic_id: topic_id, key: meetupApiKey, radius: "global", page: 200}
        }, 
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                //console.log("Success group find: " + response.body);
                console.log("Success group find!!");
                var bodyObj = JSON.parse(response.body);
                return cb(bodyObj);
            }    
            else if (error){
                return console.log("Error: " + error);
            }
            else{
                return console.log("Find Groups Status code: " + response.statusCode + ": " + response.body);
            }
        } 
    )

};

function getEventsByGroupIdListFromMeetupAPI(group_id_list, cb) {
    
    console.log("Event find request");
    
    var groupIdList = group_id_list;
    
    //Convert this list into comma seperated string
    var groupIdString = groupIdList.join();
    
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
            
            console.log("Total count: " + bodyObj.meta.total_count);
            
            //Launch another request with an incremented offset if the previous result's metadata has a "next url" listed
            if (bodyObj.meta.next){
                offset++;
                launchEventsRequest(offset);
                return;
            }
            else{
                console.log("No more events left. Results length is: " + resultsToReturn.length);
                return cb(resultsToReturn);
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
            return cb({message: "Error adding events to DB"});
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
        
        
        //Fast way to calculate sum of array
        function add(a, b) {
            return a + b;
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

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);





