var Mongoose = require('mongoose');

exports.TopicSchema = new Mongoose.Schema({
    topic_id : { type : Number, required : true },
    name : { type : String, required : true },
    num_members : { type : Number, required : true },
    description : { type : String, required : false }
});