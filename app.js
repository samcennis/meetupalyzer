'use strict';

var express     = require('express'),
    app         = express(),
    watson      = require('watson-developer-cloud'),
    bodyParser  = require('body-parser'),
    request     = require('request'),
    dotenv      = require('dotenv'),
    striptags   = require('striptags');

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

// Create the service wrapper
/*var toneAnalyzer = watson.tone_analyzer({
  url: 'https://gateway.watsonplatform.net/tone-analyzer-beta/api/',
  username: '<username>',
  password: '<password>',
  version_date: '2016-11-02',
  version: 'v3-beta'
});*/

/*var toneAnalyzer = watson.tone_analyzer({
  url: 'https://gateway.watsonplatform.net/tone-analyzer-beta/api/',
  username: '62e4910b-836b-40c9-a88e-a0ee9d4d2e97',
  password: '4vghH4Hmx9ra',
  version_date: '2016-11-02',
  version: 'v3-beta'
});*/

app.get('/', function(req, res) {
  res.render('index');
});

//Returns JSON response {topic_name, topic_id} for the first matching topic based on search
//-1 is returned for both if it doesn't find any matching topics
app.post('/api/topic_id', function(req,res,next) {
    var url = 'http://api.meetup.com/topics';
    request({
        method: 'GET', 
        url: url,
        qs: {name: req.body.topic, key: meetupApiKey, page: 20}
        }, 
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                //console.log("Success topic find: " + response.body);
                var bodyObj = JSON.parse(response.body);
                if (bodyObj.results.length == 0){
                    return res.json({topic_name : -1 , topic_id : -1}); //no matching results
                }
                else{
                    var r
                    return res.json({
                        //Return name and ID of first matching topic
                        topic_name : bodyObj.results[0].name,
                        topic_id   : bodyObj.results[0].id
                    });
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
});

app.post('/api/find/groups', function(req, res, next) {
    console.log("Group find request");
    var url = 'http://api.meetup.com/find/groups';
    request({
        method: 'GET', 
        url: url,
        qs: {topic_id: req.body.topic_id, key: meetupApiKey, radius: "global", page: 200}
        }, 
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                //console.log("Success group find: " + response.body);
                var bodyObj = JSON.parse(response.body);
                return res.json(bodyObj);
            }    
            else if (error){
                return console.log("Error: " + error);
            }
            else{
                return console.log("Find Groups Status code: " + response.statusCode + ": " + response.body);
            }
        } 
    )
});

app.post('/api/find/events', function(req, res, next) {
    console.log("Event find request");
    
    var groupIdList = req.body.group_id_list;
    
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
                return res.json(bodyObj);
            }    
            else if (error){
                return console.log("Error: " + error);
            }
            else{
                return console.log("Find Events Status code: " + response.statusCode + ": " + response.body);
            }
        } 
    )
});


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

app.post('/db/addGroupList', function(req,res,next) {
    //console.log(req.body.created);
    //var date = new Date(req.body.created);
    //console.log(date.getTime());
    
    var groupList = formatGroupList(req.body.group_list);
    
    //console.log(groupList);
    
    Group.collection.insert(groupList, function(err, docs){
        if (err) {
        // TODO: handle error
        } else {
            console.log(docs.length + " potatoes were successfully stored.");
        }
        
    });
 
});

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





