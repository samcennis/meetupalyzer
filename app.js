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
        
        getGroupsByTopicIdFromMeetupAPI(topicID,
        
            function(groupList){
                groupList = formatGroupList(groupList);   

                console.log("Update meetup data! lets make a file!");
                var file = __dirname + '/public/meetup_data/groups.json'

                jsonfile.writeFile(file, groupList, function (err) {
                    console.error(err)
                  
                    //add groups to the MongoDB database
                    addAllGroupsToDB(groupList, function(err){
                        if (err){
                            return console.log(err.message); 
                        }
                        var response = {
                            status  : 200,
                            success : 'Updated Successfully'
                        }
                        res.json(response);              
                    })  
                });              
            }    
        );     
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
                console.log("Success topic find: " + response.body);
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
    request({
        method: 'GET', 
        url: url,
        qs: {group_id: groupIdString, key: meetupApiKey, page: 1000, limited_events: true}
        }, 
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                //console.log("Success event find: " + response.body);
                var bodyObj = JSON.parse(response.body);
                return cb(bodyObj);
            }    
            else if (error){
                return console.log("Error: " + error);
            }
            else{
                return console.log("Find Events Status code: " + response.statusCode + ": " + response.body);
            }
        } 
    )
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

var TodoSchema = require('./models/Todo.js').TodoSchema;
var Todo = db.model('todos', TodoSchema);

var TopicSchema = require('./models/Topic.js').TopicSchema;
var Topic = db.model('topics', TopicSchema);

/*var EventSchema = require('./models/Event.js').EventSchema;
var Event = db.model('events', EventSchema);*/

var GroupSchema = require('./models/Group.js').GroupSchema;
var Group = db.model('groups', GroupSchema);

app.post('/api/addTodo', function(req,res,next) {
    var toAdd = new Todo( {'description' : req.body.desc, 'due' : new Date().getTime() });      
    toAdd.save(function (err, object) {
    if (err) return console.error(err);
        console.log(object.description);
    });
});

/*app.post('/db/addTopic', function(req,res,next){
    var toAdd = new Topic( {'' :  });      
    toAdd.save(function (err, object) {
    if (err) return console.error(err);
        console.log(object.description);
    });
});*/

/*
app.post('/db/addEvent', function(req,res,next) {
    var toAdd = new Topic( {'' :  });      
    toAdd.save(function (err, object) {
    if (err) return console.error(err);
        console.log(object.description);
    });    
});*/

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

app.post('/db/getGroupDataMemberMap', function(req,res,next) {
    
    Group.find({}, function(err, groups){
        var data = [];
        
        for (var i=0; i < groups.length; i++){
            data.push( { "created" : groups[i].created, "members" : groups[i].members });
            console.log(data);   
        }
        return res.json(data);
    });
});


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
        
        
        if (list[i].created){ //change creation date into Date object
            var createdDate = new Date();
            createdDate.setTime(list[i].created);
            list[i].created = createdDate;
        }
        
        list[i]._id = list[i].id;
        delete list[i].id;
        
    }
    return list;
}

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);





