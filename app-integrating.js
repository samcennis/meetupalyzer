'use strict';

var express     = require('express'),
    app         = express(),
    watson      = require('watson-developer-cloud'),
    bodyParser  = require('body-parser'),
    request     = require('request'),
    dotenv      = require('dotenv');

//Load environment variables
dotenv.load();
var meetupApiKey = process.env.MEETUP_API_KEY;

// Express settings/config
app.enable('trust proxy');
app.set('view engine', 'ejs');
require('ejs').delimiter = '$';
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
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
                console.log("Success: " + response.body);
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
                return console.log("Status code: " + response.statusCode);
            }
        } 
    )  
});

app.post('/api/find/groups', function(req, res, next) {
    var url = 'http://api.meetup.com/find/groups';
    request({
        method: 'GET', 
        url: url,
        qs: {topic_id: req.body.topic_id, key: meetupApiKey, radius: "global", page: 20}
        }, 
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                //console.log("Success: " + response.body);
                var bodyObj = JSON.parse(response.body);
                return res.json(bodyObj); //no matching results
            }    
            else if (error){
                return console.log("Error: " + error);
            }
            else{
                return console.log("Status code: " + response.statusCode);
            }
        } 
    )
});

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);

//---------------------------------------------------------------------------------------

/**
 * Module dependencies
 */

var express     = require('express'),
  bodyParser    = require('body-parser'),
  methodOverride= require('method-override'),
  errorHandler  = require('error-handler'),
  morgan        = require('morgan'),
  routes        = require('./routes'),
  api           = require('./routes/api'),
  http          = require('http'),
  path          = require('path');
  watson        = require('watson-developer-cloud'),
  request       = require('request'),
  dotenv        = require('dotenv');


var app = module.exports = express();

/**
 * Configuration
 */

// Load environment variables (initial)
dotenv.load();
var meetupApiKey = process.env.MEETUP_API_KEY;

// all environments (from seed)
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
//app.set('view engine', 'jade');
app.use(morgan('dev'));
//app.use(bodyParser());
app.use(methodOverride());
app.use(express.static(path.join(__dirname, 'public')));

// all environments (From intial)
app.enable('trust proxy');
app.set('view engine', 'ejs');
require('ejs').delimiter = '$';
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
//app.use(express.static(__dirname + '/public'));

var env = process.env.NODE_ENV || 'development';

// development only
if (env === 'development') {
  app.use(express.errorHandler());
}

// production only
if (env === 'production') {
  // TODO
}

/**
 * Routes
 */

// serve index and view partials
app.get('/', routes.index);
app.get('/partials/:name', routes.partials);

// JSON API
app.get('/api/name', api.name);

// redirect all others to the index (HTML5 history)
app.get('*', routes.index);


/**
 * Start Server
 */

http.createServer(app).listen(app.get('port'), function () {
  console.log('Express server listening on port ' + app.get('port'));
});

